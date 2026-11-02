'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// --- fake Percy CLI server --------------------------------------------------
const received = [];
let server;
let port;

function makePng(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pd-')), 'shot.png');
  fs.writeFileSync(p, buf);
  return p;
}

// --- fake Detox API ----------------------------------------------------------
function fakeDetox({ cloud = true, frames = {}, rootFrame = { x: 0, y: 0, width: 1080, height: 2340 } } = {}) {
  const calls = [];
  const shot = makePng(1080, 2340);
  const mkEl = (desc) => ({
    desc,
    atIndex(i) { return mkEl(`${desc}@${i}`); },
    async takeScreenshot(n) { calls.push(['element.takeScreenshot', desc, n]); return shot; },
    async getAttributes() {
      if (desc.startsWith('type:')) return { frame: rootFrame };
      const id = desc.replace('id:', '');
      if (!frames[id]) throw new Error('not found');
      return { frame: frames[id] };
    }
  });
  return {
    calls,
    shot,
    detox: {
      device: {
        name: 'fallback',
        getPlatform: () => 'android',
        async takeScreenshot(n) { calls.push(['device.takeScreenshot', n]); return cloud ? '' : shot; }
      },
      element: (m) => mkEl(m),
      by: { id: (id) => `id:${id}`, type: (t) => `type:${t}` }
    },
    detoxConfig: cloud
      ? { type: 'android.cloud', name: 'Samsung Galaxy S22', osVersion: '12.0' }
      : { type: 'android.emulator', name: 'Pixel_7_API_34' }
  };
}

test.before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('x-percy-core-version', '1.32.12');
      if (req.url.startsWith('/percy/healthcheck')) {
        return res.end(JSON.stringify({ success: true, type: 'app', config: {}, build: { id: '1' } }));
      }
      if (req.url.startsWith('/percy/comparison')) {
        received.push(JSON.parse(body));
        return res.end(JSON.stringify({ success: true, data: { name: 'ok' } }));
      }
      if (req.url.startsWith('/percy/events')) return res.end('{"success":true}');
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
  process.env.PERCY_SERVER_ADDRESS = `http://localhost:${port}`;
});

test.after(() => server.close());
test.beforeEach(() => { received.length = 0; });

const percyScreenshot = require('..');

test('cloud: falls back to root element screenshot and posts comparison', async () => {
  const f = fakeDetox({ cloud: true });
  await percyScreenshot('Home', { detox: f.detox, detoxConfig: f.detoxConfig });

  assert.deepStrictEqual(f.calls.map((c) => c[0]), ['element.takeScreenshot']);
  assert.strictEqual(f.calls[0][1], 'type:android.widget.FrameLayout@0');
  assert.strictEqual(received.length, 1);
  const p = received[0];
  assert.strictEqual(p.name, 'Home');
  assert.deepStrictEqual(p.tag, {
    name: 'Samsung Galaxy S22', osName: 'Android', osVersion: '12.0', width: 1080, height: 2340, orientation: 'portrait'
  });
  assert.strictEqual(p.tiles[0].filepath, undefined);
  assert.strictEqual(p.tiles[0].content, fs.readFileSync(f.shot).toString('base64'));
  assert.strictEqual(p.tiles[0].statusBarHeight, 0);
  assert.match(p.clientInfo, /^percy-detox\//);
});

test('local: uses device.takeScreenshot', async () => {
  const f = fakeDetox({ cloud: false });
  await percyScreenshot('Local', { detox: f.detox, detoxConfig: f.detoxConfig, statusBarHeight: 63 });
  assert.deepStrictEqual(f.calls.map((c) => c[0]), ['device.takeScreenshot']);
  assert.strictEqual(received[0].tag.name, 'Pixel_7_API_34');
  assert.strictEqual(received[0].tiles[0].statusBarHeight, 63);
});

test('ignore/consider regions from testIDs and custom boxes', async () => {
  const f = fakeDetox({ frames: { clock: { x: 10, y: 100, width: 200, height: 50 } } });
  await percyScreenshot('Regions', {
    detox: f.detox,
    detoxConfig: f.detoxConfig,
    ignoreRegionTestIDs: ['clock', 'missing'],
    customIgnoreRegions: [{ top: 0, left: 0, bottom: 10, right: 10 }, { top: 0, left: 0, bottom: 99999, right: 1 }],
    considerRegionTestIDs: ['clock']
  });
  const ign = received[0].ignoredElementsData.ignoreElementsData;
  assert.deepStrictEqual(ign, [
    { selector: 'testID: clock', coOrdinates: { top: 100, bottom: 150, left: 10, right: 210 } },
    { selector: 'custom region 0', coOrdinates: { top: 0, bottom: 10, left: 0, right: 10 } }
  ]);
  assert.strictEqual(received[0].consideredElementsData.considerElementsData.length, 1);
});

test('region coordinates are relative to a non-zero root origin', async () => {
  const f = fakeDetox({ rootFrame: { x: 0, y: 80, width: 1080, height: 2260 }, frames: { btn: { x: 0, y: 180, width: 100, height: 20 } } });
  await percyScreenshot('Offset', { detox: f.detox, detoxConfig: f.detoxConfig, ignoreRegionTestIDs: ['btn'] });
  assert.deepStrictEqual(received[0].ignoredElementsData.ignoreElementsData[0].coOrdinates, { top: 100, bottom: 120, left: 0, right: 100 });
});

test('rootTestID option targets that view', async () => {
  const f = fakeDetox({ frames: { appRoot: { x: 0, y: 0, width: 1080, height: 2340 } } });
  await percyScreenshot('Root', { detox: f.detox, detoxConfig: f.detoxConfig, rootTestID: 'appRoot' });
  assert.strictEqual(f.calls[0][1], 'id:appRoot');
});

test('errors are swallowed by default, thrown when ignoreErrors=false', async () => {
  const f = fakeDetox();
  f.detox.element = () => ({ atIndex() { return this; }, async takeScreenshot() { throw new Error('boom'); } });
  await percyScreenshot('Err', { detox: f.detox, detoxConfig: f.detoxConfig });
  await assert.rejects(percyScreenshot('Err2', { detox: f.detox, detoxConfig: f.detoxConfig, ignoreErrors: false }), /boom/);
});
