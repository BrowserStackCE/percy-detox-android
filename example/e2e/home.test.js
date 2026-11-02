const percyScreenshot = require('percy-detox');

describe('Home', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('renders the home screen', async () => {
    await waitFor(element(by.id('home-title'))).toBeVisible().withTimeout(10000);

    // Full-window visual snapshot, with dynamic content masked out
    await percyScreenshot('Home screen', {
      ignoreRegionTestIDs: ['live-clock', 'promo-carousel']
    });
  });

  it('renders the settings screen', async () => {
    await element(by.id('settings-tab')).tap();
    await expect(element(by.id('settings-list'))).toBeVisible();

    await percyScreenshot('Settings screen', {
      // Only compare the list, ignore everything else on screen
      considerRegionTestIDs: ['settings-list']
    });
  });
});
