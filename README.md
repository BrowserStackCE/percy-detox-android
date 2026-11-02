# percy-detox

App Percy visual testing for **Detox** — including Detox on **BrowserStack App Automate** (`android.cloud`).

```js
const percyScreenshot = require('percy-detox');

await percyScreenshot('Home screen', { ignoreRegionTestIDs: ['live-clock'] });
```

## How it works

Detox on BrowserStack runs your Jest specs **on your machine / CI runner** and drives a real cloud device over `wss://detox.browserstack.com`. That means the Percy CLI can run locally right next to the tests:

```
percy app:exec ──starts──▶ local Percy server (:5338)
      │
      └─ detox test -c android.cloud.debug
            └─ percyScreenshot('Home')
                 1. capture PNG from the cloud device (over the Detox websocket)
                 2. POST /percy/comparison  { tag: device/os/size, tiles: [png], regions }
                                               └──▶ App Percy build
```

| Part | Runs on |
|---|---|
| Jest specs, Detox client, Percy CLI, `percyScreenshot()` | Your machine / CI runner |
| The app, taps, and the screenshot capture itself | The BrowserStack real device |

**Capture strategy.** In BrowserStack's Detox fork (`@browserstack/detox`), `device.takeScreenshot()` on the `android.cloud` driver is a no-op that returns `''`. Element screenshots *do* work, because `element.takeScreenshot()` runs as an Espresso action in the app and returns base64 over the websocket. So on cloud the SDK screenshots the window root view, which is the DecorView, `FrameLayout` at index 0. Locally it uses `device.takeScreenshot()`.

The SDK reads the PNG right after capture and sends its bytes to Percy, not a file path. Detox deletes its temporary screenshot files, so a path could be gone by the time Percy uploads it.

| `screenshotMode` | What it captures | Used when |
|---|---|---|
| `auto` (default) | `device` locally, `element` on `android.cloud` | — |
| `device` | Full device screen, including system status bar | Local emulator/simulator |
| `element` | App window (DecorView) or `rootTestID` view. System status-bar icons aren't drawn, so there's no clock or battery noise | BrowserStack cloud |

## Using it in your app

The SDK is app-agnostic. Each app needs:

1. Detox wired into its Android build, in a way that works on BrowserStack (step 2).
2. `percyScreenshot()` calls in its tests (step 4).

If an app already runs Detox on BrowserStack, skip step 2.

### 1. Install

```bash
npm i -D percy-detox @percy/cli
# BrowserStack's Detox fork, per the Detox getting-started doc
npm i -D detox@npm:@browserstack/detox@20.51.3-cloud.1
```

Until `percy-detox` is published, install it from a local path or git URL instead, e.g. `npm i -D /path/to/percy-detox`. When it's linked like this (`npm link` or `file:`), the SDK resolves `detox` from your project's directory, so the Percy device tag still works.

### 2. Prepare the Android app

These were all required to get the React Native example in `example/` running on BrowserStack. The paths are for a standard React Native project.

**`android/settings.gradle`**: the BrowserStack fork ships Detox's Android library as source, not as a prebuilt Maven repo:

```groovy
include ':detox'
project(':detox').projectDir = new File(rootProject.projectDir, '../node_modules/detox/android/detox')
```

**`android/build.gradle`** (`buildscript.ext`): the fork's Kotlin needs 2.0.x:

```groovy
kotlinVersion = "2.0.21"
detoxKotlinVersion = kotlinVersion
```

**`android/app/build.gradle`**

```groovy
react {
    debuggableVariants = []   // bundle JS into the debug APK: cloud devices have no Metro
}
android {
    defaultConfig {
        testBuildType System.getProperty("testBuildType", "debug")
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        missingDimensionStrategy "detox", "full"
    }
}
dependencies {
    androidTestImplementation(project(":detox"))
}
```

**`android/app/src/androidTest/java/<your/package>/DetoxTest.java`**: the standard Detox runner. Copy it from `example/android/app/src/androidTest/java/com/percydetoxexample/DetoxTest.java` and change the package name.

**`android/app/src/main/res/xml/network_security_config.xml`**: Detox on BrowserStack talks to the app over cleartext `127.0.0.1`. If that host isn't listed, `launchApp()` hangs until it fails with `Socket idle from a long time`.

```xml
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">127.0.0.1</domain>
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
  </domain-config>
</network-security-config>
```

Reference it from `AndroidManifest.xml` with `android:networkSecurityConfig="@xml/network_security_config"` on `<application>`.

**Patch a compile error in `@browserstack/detox@20.51.3-cloud.1`.** In `node_modules/detox/android/detox/src/full/java/com/wix/detox/reactnative/idlingresources/bridge/BridgeIdlingResource.kt`, the `when (method.name)` inside the proxy `InvocationHandler` has no `else` branch. Add one as the last branch:

```kotlin
                        "toString" -> "BridgeIdleListenerProxy"
                        else -> null
```

Save the fix with [`patch-package`](https://www.npmjs.com/package/patch-package) so it survives `npm install`:

```bash
npm i -D patch-package
npx patch-package detox
# then add "postinstall": "patch-package" to package.json scripts
```

**`e2e/jest.config.js`**: disable Babel for e2e specs. They're plain Node, and the React Native Babel preset breaks `require('percy-detox')` (`Cannot find module '@babel/runtime/...'`):

```js
transform: {},
```

### 3. Configure Detox

Add an `android.cloud` device and configuration. Copy them from `example/detox.config.js`. The Percy device tag is read from `devices.cloud.device.name` / `osVersion`:

```js
devices: {
  cloud: { type: 'android.cloud', device: { name: 'Samsung Galaxy S22', osVersion: '12.0' } },
  attached: { type: 'android.attached', device: { adbName: '.*' } }   // local emulator or USB phone
},
```

### 4. Add snapshots to your tests

```js
const percyScreenshot = require('percy-detox');

it('checkout page', async () => {
  await element(by.id('cart-button')).tap();
  await percyScreenshot('Checkout', {
    ignoreRegionTestIDs: ['order-timestamp'],   // mask dynamic UI
  });
});
```

Snapshot names must be unique within a build. See [Options](#options) for regions, root views, and error handling.

### 5. Build, upload and run

```bash
# One App Percy project per app. App tokens start with app_
export PERCY_TOKEN=app_xxxxxxxx
export BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=...
# Required even for cloud runs. Detox refuses to start without it
export ANDROID_SDK_ROOT=~/Library/Android/sdk

cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..
eval "$(bash path/to/percy-detox/scripts/bs-upload.sh \
  android/app/build/outputs/apk/debug/app-debug.apk \
  android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk)"

npx percy app:exec -- detox test -c android.cloud.debug
```

Uploads are reusable until they expire (about 30 days). Rebuild and re-upload only when the app changes.

Without `percy app:exec` (or without `PERCY_TOKEN`), `percyScreenshot` does nothing, so the same specs run normally.

To run on a local emulator or USB phone instead, use the `attached` device: `npx percy app:exec -- detox test -c android.att.debug`.

## Example app

`example/` is a working React Native 0.76 app with Home and Settings tabs, set up as described above. The `node_modules` patch isn't saved with `patch-package` yet, so reapply it after every `npm install`.

```bash
cd example
npm install                      # then reapply the BridgeIdlingResource.kt patch
npm run build:android
eval "$(npm run -s bs:upload)"
npm run test:percy:cloud         # BrowserStack real device
npm run test:percy:attached      # running emulator or USB phone (android.att.debug)
npm run test:percy:local         # boots the Pixel_7_API_34 AVD (android.emu.debug)
```

## Options

| Option | Default | Notes |
|---|---|---|
| `deviceName` / `osVersion` | Detox device config | Env: `PERCY_DETOX_DEVICE_NAME`, `PERCY_DETOX_OS_VERSION` |
| `orientation` | from image size | `portrait` / `landscape` |
| `screenshotMode` | `auto` | Env: `PERCY_DETOX_SCREENSHOT_MODE` |
| `rootTestID` / `rootElement` | DecorView | View to capture in element mode. Env: `PERCY_DETOX_ROOT_TEST_ID` |
| `statusBarHeight` / `navigationBarHeight` | `0` | px excluded from the diff |
| `ignoreRegionTestIDs` / `ignoreRegionElements` / `customIgnoreRegions` | — | Mask dynamic UI. Custom = `{top,bottom,left,right}` in px |
| `considerRegionTestIDs` / `considerRegionElements` / `customConsiderRegions` | — | Diff only these areas |
| `scaleFactor` | `1` | Frame units → px. Android frames are already px; on iOS pass the pixel ratio |
| `sync`, `testCase`, `labels` | — | Passed through to Percy |
| `ignoreErrors` | `true` | Percy failures are logged and don't fail the test. Env: `PERCY_DETOX_IGNORE_ERRORS=false` |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `launchApp()` hangs, then `Socket idle from a long time` / "Detox can't seem to connect to the test app" | Add `127.0.0.1` to `network_security_config.xml` (step 2) |
| `$ANDROID_SDK_ROOT is not defined` | Export `ANDROID_SDK_ROOT`, even for cloud runs |
| `'when' expression must be exhaustive` in `BridgeIdlingResource.kt` | Apply the fork patch (step 2) |
| `Could not resolve project :detox … cannot choose between … coreNativeDebugApiElements / fullDebugApiElements` | Add `missingDimensionStrategy "detox", "full"` |
| `Cannot find module '@babel/runtime/helpers/…'` from `percy-detox` | Set `transform: {}` in `e2e/jest.config.js` |
| Percy shows "Unknown device" | Set `devices.<name>.device.name` / `osVersion` in the Detox config, or pass `deviceName` / `osVersion` |
| Percy warns the project type isn't `app` | Use an App Percy token (`app_…`), not a web token (`web_…`) |
| App shows a red screen / "Unable to load script" on the cloud | The JS isn't bundled into the APK. Set `debuggableVariants = []` |

## Limitations

- Detox on BrowserStack is Android-only (beta). iOS works only locally on a simulator, using `device` mode.
- Element mode captures what the app window draws. Separate windows (system dialogs, permission prompts, some popups, toasts) aren't included.
- No full-page or scrolling capture. Take one snapshot per scroll position instead.
- The snapshot's "debug URL" is not auto-linked to the BrowserStack session yet. Pass `externalDebugUrl` if you have it.

## Development

```bash
npm test   # unit tests against a fake Detox API and a fake Percy server
```

The unit tests check the SDK's logic only. Run the example against a real device and Percy before shipping changes to capture or upload.
