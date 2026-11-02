/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: { $0: 'jest', config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 300000 }
  },
  apps: {
    // Local emulator build (optional — for running Percy locally)
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug'
    },
    // BrowserStack App Automate — ids come from scripts/bs-upload.sh
    'android.cloud.debug': {
      type: 'android.cloud',
      app: process.env.BROWSERSTACK_APP_URL,
      appClient: process.env.BROWSERSTACK_APP_CLIENT_URL
    }
  },
  devices: {
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7_API_34' } },
    attached: { type: 'android.attached', device: { adbName: process.env.ADB_NAME || '.*' } },
    cloud: {
      type: 'android.cloud',
      // percy-detox reads name + osVersion from here for the Percy device tag
      device: { name: process.env.BS_DEVICE || 'Samsung Galaxy S22', osVersion: process.env.BS_OS_VERSION || '12.0' }
    }
  },
  configurations: {
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
    'android.att.debug': { device: 'attached', app: 'android.debug' },
    'android.cloud.debug': {
      device: 'cloud',
      app: 'android.cloud.debug',
      cloudAuthentication: {
        username: process.env.BROWSERSTACK_USERNAME,
        accessKey: process.env.BROWSERSTACK_ACCESS_KEY
      },
      session: {
        server: 'wss://detox.browserstack.com/init',
        name: process.env.BS_SESSION_NAME || 'percy-detox-session',
        build: process.env.BS_BUILD_NAME || 'percy-detox-build',
        project: process.env.BS_PROJECT_NAME || 'percy-detox'
      }
    }
  }
};
