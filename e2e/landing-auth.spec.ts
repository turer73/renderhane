import {expect, test} from '@playwright/test';

test('signed-in landing header keeps the selected 3D tool destination', async ({page}) => {
  await page.goto('/tr', {waitUntil: 'domcontentloaded'});
  const header = page.locator('.rhl-header');
  await expect(header.locator('.rhl-login')).toHaveCount(0);
  const cta = header.locator('.rhl-btn.small');
  await expect(cta).toHaveText(/Uygulamaya git/i);
  await expect(cta).toHaveAttribute('href', '/tr/app?tool=img-to-3d');
});
