'use strict';

const fs = require('fs');
const utils = require('@percy/sdk-utils');
const { pngSize } = require('./lib/png');

const pkg = require('./package.json');
const CLIENT_INFO = `${pkg.name}/${pkg.version}`;
const log = utils.logger('detox');

// Resolve detox from this package first, then from the test project (cwd).
// The second lookup matters when percy-detox is linked (npm link / file:..),
// because its own node_modules path then has no detox.
function requireDetox(id) {
  try { return require(id); } catch { /* try project */ }
  return require(require.resolve(id, { paths: [process.cwd()] }));
}

let detoxPkg = null;
try { detoxPkg = requireDetox('detox/package.json'); } catch { /* optional */ }
const ENV_INFO = detoxPkg ? `detox/${detoxPkg.version}` : 'detox/unknown';

// ---------------------------------------------------------------------------
// Detox access helpers. Globals are what Detox normally injects into the test
// environment; `options.detox` lets callers (and unit tests) pass them in.
// ---------------------------------------------------------------------------
function detoxApi(options) {
  const injected = options.detox || {};
  const g = global;
  let mod = null;
  const need = !(injected.device || g.device) || !(injected.element || g.element) || !(injected.by || g.by);
  if (need) { try { mod = requireDetox('detox'); } catch { /* not installed */ } }
  return {
    device: injected.device || g.device || mod?.device,
    element: injected.element || g.element || mod?.element,
    by: injected.by || g.by || mod?.by
  };
}

// Reads the device block from the active Detox configuration, e.g.
// { name: 'Samsung Galaxy S22', osVersion: '12.0' } for type "android.cloud".
function detoxDeviceConfig(options) {
  if (options.detoxConfig) return options.detoxConfig;
  try {
    const internals = requireDetox('detox/internals');
    // Detox 20 exposes the resolved device config as `config.device`.
    const dc = internals?.config?.device || internals?.config?.deviceConfig;
    if (!dc) return {};
    const d = typeof dc.device === 'object' ? dc.device : {};
    // adbName is often a regex (e.g. ".*"), so it's no use as a device name.
    // Leave the name unset and fall back to device.name at runtime.
    return { type: dc.type, name: d.name || d.type || d.avdName, osVersion: d.osVersion || d.os };
  } catch {
    return {};
  }
}

// Default root view: the window's DecorView (a FrameLayout at index 0 of the
// hierarchy) on Android. On iOS a testID-based root must be supplied.
function rootElement(api, options) {
  const { element, by } = api;
  if (options.rootElement) return options.rootElement;
  const rootTestID = options.rootTestID || process.env.PERCY_DETOX_ROOT_TEST_ID;
  if (rootTestID) return element(by.id(rootTestID));
  return element(by.type('android.widget.FrameLayout')).atIndex(0);
}

// ---------------------------------------------------------------------------
// Screenshot capture.
//   mode "device"  -> device.takeScreenshot() (local emulator/simulator)
//   mode "element" -> element.takeScreenshot() on the root view. This travels
//                     over the Detox websocket, so it works on BrowserStack's
//                     android.cloud driver where device.takeScreenshot() is a
//                     no-op that returns ''.
//   mode "auto"    -> device first, falls back to element.
// ---------------------------------------------------------------------------
async function capture(api, name, options) {
  const mode = options.screenshotMode || process.env.PERCY_DETOX_SCREENSHOT_MODE || 'auto';
  const isCloud = options._deviceConfig.type === 'android.cloud';

  if (mode === 'device' || (mode === 'auto' && !isCloud)) {
    let filepath = '';
    try {
      filepath = await api.device.takeScreenshot(`percy-${name}`);
    } catch (e) {
      if (mode === 'device') throw e;
      log.debug(`device.takeScreenshot failed, falling back to element mode: ${e}`);
    }
    if (filepath) return { filepath, origin: { x: 0, y: 0 }, mode: 'device' };
    if (mode === 'device') throw new Error('device.takeScreenshot() returned no file');
  }

  const root = rootElement(api, options);
  const filepath = await root.takeScreenshot(`percy-${name}`);
  if (!filepath) throw new Error('Root element screenshot returned no file');
  let origin = { x: 0, y: 0 };
  try {
    const attrs = await root.getAttributes();
    if (attrs?.frame) origin = { x: attrs.frame.x || 0, y: attrs.frame.y || 0 };
  } catch (e) {
    log.debug(`Could not read root frame, assuming origin 0,0: ${e}`);
  }
  return { filepath, origin, mode: 'element' };
}

// ---------------------------------------------------------------------------
// Regions (ignore / consider). Element frames come from getAttributes():
// Android = screen pixels, iOS = points (multiply by scaleFactor).
// ---------------------------------------------------------------------------
async function regionsFor(api, { testIDs = [], elements = [], custom = [] }, shot, size, scale) {
  const out = [];
  const toRegion = (selector, f) => ({
    selector,
    coOrdinates: {
      top: Math.round((f.y * scale) - shot.origin.y),
      bottom: Math.round(((f.y + f.height) * scale) - shot.origin.y),
      left: Math.round((f.x * scale) - shot.origin.x),
      right: Math.round(((f.x + f.width) * scale) - shot.origin.x)
    }
  });

  const fromElement = async (selector, el) => {
    try {
      const attrs = await el.getAttributes();
      const list = attrs?.elements ? attrs.elements : [attrs];
      list.forEach((a, i) => {
        if (a?.frame) out.push(toRegion(list.length > 1 ? `${selector}[${i}]` : selector, a.frame));
      });
    } catch (e) {
      log.info(`Element ${selector} not found, skipping region`);
      log.debug(String(e));
    }
  };

  for (const id of testIDs) await fromElement(`testID: ${id}`, api.element(api.by.id(id)));
  for (let i = 0; i < elements.length; i++) await fromElement(`element: ${i}`, elements[i]);

  custom.forEach((r, i) => {
    const valid = r && r.top >= 0 && r.left >= 0 && r.bottom > r.top && r.right > r.left &&
      r.bottom <= size.height && r.right <= size.width;
    if (!valid) return log.info(`Custom region at index ${i} is out of bounds, skipping`);
    out.push({ selector: `custom region ${i}`, coOrdinates: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
  });
  return out;
}

function orientationOf(options, size) {
  const o = (options.orientation || process.env.PERCY_DETOX_ORIENTATION || 'auto').toLowerCase();
  if (o === 'portrait' || o === 'landscape') return o;
  return size.width > size.height ? 'landscape' : 'portrait';
}

/**
 * Capture a screenshot of the app under test and upload it to App Percy.
 * Run your Detox command under `percy app:exec -- detox test ...`.
 *
 * @param {string} name   Snapshot name (unique per build)
 * @param {object} [options]
 */
async function percyScreenshot(name, options = {}) {
  if (!name || typeof name !== 'string') throw new TypeError('percyScreenshot: `name` is required');
  if (!(await utils.isPercyEnabled())) return;

  if (utils.percy?.type && utils.percy.type !== 'app') {
    log.warn(`Percy project type is "${utils.percy.type}". Use an App Percy project token (app_...) for Detox.`);
  }

  try {
    const api = detoxApi(options);
    if (!api.device || !api.element || !api.by) {
      throw new Error('Detox globals (device/element/by) not found. Call percyScreenshot from inside a Detox test.');
    }

    const dc = detoxDeviceConfig(options);
    options = { ...options, _deviceConfig: dc };

    const shot = await capture(api, name, options);
    const size = await pngSize(shot.filepath);
    const platform = typeof api.device.getPlatform === 'function' ? api.device.getPlatform() : 'android';
    const osName = platform === 'ios' ? 'iOS' : 'Android';
    const scale = Number(options.scaleFactor || process.env.PERCY_DETOX_SCALE_FACTOR || 1);

    const tag = {
      name: options.deviceName || process.env.PERCY_DETOX_DEVICE_NAME || dc.name || api.device.name || 'Unknown device',
      osName,
      osVersion: String(options.osVersion || process.env.PERCY_DETOX_OS_VERSION || dc.osVersion || ''),
      width: size.width,
      height: size.height,
      orientation: orientationOf(options, size)
    };

    // Send the PNG bytes, not the path. Detox writes screenshots to temp files
    // that it deletes once the test ends. Percy CLI uploads in the background,
    // so a path could already be gone by the time it reads it.
    const content = (await fs.promises.readFile(shot.filepath)).toString('base64');

    // In element mode the status bar is not captured as system UI (no clock,
    // battery, etc.), so the default height is 0. Override if you see diffs.
    const tiles = [{
      content,
      statusBarHeight: Number(options.statusBarHeight ?? process.env.PERCY_DETOX_STATUS_BAR_HEIGHT ?? 0),
      navBarHeight: Number(options.navigationBarHeight ?? process.env.PERCY_DETOX_NAV_BAR_HEIGHT ?? 0),
      headerHeight: 0,
      footerHeight: 0,
      fullscreen: !!options.fullscreen
    }];

    const ignoreRegions = await regionsFor(api, {
      testIDs: options.ignoreRegionTestIDs,
      elements: options.ignoreRegionElements,
      custom: options.customIgnoreRegions
    }, shot, size, scale);
    const considerRegions = await regionsFor(api, {
      testIDs: options.considerRegionTestIDs,
      elements: options.considerRegionElements,
      custom: options.customConsiderRegions
    }, shot, size, scale);

    log.debug(`[${name}] mode=${shot.mode} tag=${JSON.stringify(tag)}`);

    const response = await utils.postComparison({
      name,
      tag,
      tiles,
      externalDebugUrl: options.externalDebugUrl || process.env.PERCY_DETOX_DEBUG_URL || null,
      ignoredElementsData: { ignoreElementsData: ignoreRegions },
      consideredElementsData: { considerElementsData: considerRegions },
      environmentInfo: ENV_INFO,
      clientInfo: CLIENT_INFO,
      sync: options.sync || null,
      testCase: options.testCase,
      labels: options.labels
    });
    return response?.body?.data;
  } catch (e) {
    log.error(`[${name}] failed to take screenshot`);
    log.error(e);
    try { await utils.postBuildEvents({ clientInfo: CLIENT_INFO, message: String(e), errorKind: 'sdk' }); } catch { /* ignore */ }
    // Like the Appium SDK, Percy errors don't fail functional tests unless asked to.
    if (options.ignoreErrors === false || process.env.PERCY_DETOX_IGNORE_ERRORS === 'false') throw e;
  }
}

module.exports = percyScreenshot;
module.exports.percyScreenshot = percyScreenshot;
module.exports.isPercyEnabled = () => utils.isPercyEnabled();
module.exports.CLIENT_INFO = CLIENT_INFO;
