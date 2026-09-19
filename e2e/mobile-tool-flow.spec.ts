import {expect, test} from '@playwright/test';

test.describe('public mobile tool flows', () => {
  test('homepage uses the promoted demo as its only interface', async ({page}) => {
    await page.goto('/tr/launch-preview');
    await expect(page).toHaveURL(/\/tr$/);
    await expect(page.locator('main#rhl-main')).toHaveCount(1);
    await expect(page.locator('.rhl-header')).toHaveCount(1);
    await expect(page.locator('header.sticky')).toHaveCount(0);
    await expect(page.locator('.rhl-notice')).toHaveCount(0);
    await expect(page.locator('[href^="/tr/launch-preview"]')).toHaveCount(0);
    await expect(page.locator('[href="/tr/araclar/qr-kod"]')).not.toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Dark mode'})).toBeVisible();
  });
  test('legacy demo routes preserve their destinations', async ({page}) => {
    await page.goto('/tr/launch-preview/araclar/sahne-olustur');
    await expect(page).toHaveURL(/\/tr\/araclar\/sahne-olustur$/);
    await page.goto('/tr/launch-preview/araclar/tum-araclar');
    await expect(page).toHaveURL(/\/tr#rhl-free$/);
    await expect(page.locator('#rhl-free')).toBeVisible();
  });
  test('QR uses content, style, and verified export steps', async ({page}) => {
    await page.goto('/tr/araclar/qr-kod');

    const content = page.locator('[data-qr-pane="content"]');
    const style = page.locator('[data-qr-pane="style"]');
    const preview = page.locator('[data-qr-pane="preview"]');
    await expect(page.getByRole('tab', {name: '1 · İçerik'})).toHaveAttribute('aria-selected', 'true');
    await expect(content).toBeVisible();
    await expect(style).toBeHidden();
    await expect(preview).toBeHidden();

    await page.locator('#rh-qr-url').fill('not-a-valid-url');
    await expect(page.locator('#rh-qr-error')).toBeVisible();
    await expect(page.locator('#rh-qr-error')).toHaveText(/https/i);
    await page.locator('#rh-qr-url').fill('https://renderhane.com');

    await page.getByRole('tab', {name: '1 · İçerik'}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', {name: '2 · Stil'})).toBeFocused();
    await expect(style).toBeVisible();
    await expect(content).toBeHidden();
    await expect(page.getByRole('button', {name: /Yıldız/})).toBeVisible();

    await page.getByRole('tab', {name: '3 · Önizle ve indir'}).click();
    await expect(preview).toBeVisible();
    await expect(page.locator('#rh-qr-check')).toHaveAttribute('data-state', 'passed');
    await expect(page.getByRole('button', {name: 'PNG indir'})).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test('QR remains a single-column workspace at 720px', async ({page}) => {
    await page.setViewportSize({width: 720, height: 900});
    await page.goto('/tr/araclar/qr-kod');
    const columns = await page.locator('.rh-qr-workspace').evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
    );
    expect(columns).toBe(1);
  });

  test('production tool pages retain locale switching', async ({page}) => {
    await page.goto('/tr/araclar/qr-kod');
    await expect(page.locator('footer a[href="/en/araclar/qr-kod"]')).toHaveText(/Dil:\s*en/i);
  });

  test('manual composer exposes four focused inspector tabs', async ({page}) => {
    await page.goto('/tr/araclar/arka-plan-kaldirma');
    await page.getByRole('button', {name: /Sahneye yerleştir/}).click();

    const dialog = page.getByRole('dialog', {name: /Ürününü sahneye yerleştir/});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveCount(4);
    await expect(dialog.getByRole('tab', {name: 'Ürün'})).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('[data-mc-panel="product"]')).toBeVisible();
    await expect(dialog.locator('[data-mc-panel="background"]')).toBeHidden();

    await dialog.getByRole('tab', {name: 'Ürün'}).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('tab', {name: 'Konum'})).toBeFocused();
    await expect(dialog.locator('[data-mc-panel="position"]')).toBeVisible();
    await expect(dialog.locator('#mc-scale')).toBeVisible();

    await dialog.getByRole('tab', {name: 'İndir'}).click();
    await expect(dialog.locator('[data-mc-panel="export"]')).toBeVisible();
    await expect(dialog.getByRole('button', {name: 'PNG indir'})).toBeEnabled();
    await expect(dialog.locator('#mc-canvas')).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });

  test('homepage retains public, legal, language, and legacy anchor links', async ({page}) => {
    await page.goto('/tr');
    await expect(page.locator('#demo')).toHaveCount(1);
    await expect(page.locator('#features')).toHaveCount(1);
    await expect(page.locator('#pricing')).toHaveCount(1);
    for (const href of ['/tr/hakkimizda', '/tr/blog', '/tr/privacy', '/tr/terms', '/tr/kvkk', '/tr/cookie-policy', '/tr/iletisim', '/en']) {
      await expect(page.locator(`footer a[href="${href}"]`)).toHaveCount(1);
    }
  });

  test('English QR keeps user data and localized mobile steps', async ({page}) => {
    await page.goto('/en/araclar/qr-kod');

    const value = 'https://example.com/Telefon/Mesaj?text=Merhaba';
    await expect(page.getByRole('tab', {name: '1 · Content'})).toBeVisible();
    await page.locator('#rh-qr-url').fill(value);
    await page.getByRole('tab', {name: '2 · Style'}).click();
    await page.getByRole('tab', {name: '1 · Content'}).click();
    await expect(page.locator('#rh-qr-url')).toHaveValue(value);

    await expect(page.locator('[data-idea-filter="all"]')).toBeVisible();
    await page.locator('[data-idea]').first().click();
    await expect(page.locator('#rh-idea-detail')).toBeVisible();
    await page.locator('#rh-idea-form button[type=submit]').click();
    await expect(page.locator('#rh-idea-form-status')).toHaveText('Enter a link to a page you own or have permission to share.');
    await page.locator('#rh-idea-url').fill('https://example.com/ready');
    await page.locator('#rh-idea-form button[type=submit]').click();
    await expect(page.locator('#rh-idea-form-status')).toHaveText('Select the confirmation checkbox to replace the current content.');
    await expect(page.locator('body')).not.toContainText('Fikir kategorisi');
  });

  test('English manual composer is localized and uses the English login route', async ({page}) => {
    await page.goto('/en/araclar/arka-plan-kaldirma');
    await page.getByRole('button', {name: /Place in scene/}).click();

    const dialog = page.getByRole('dialog', {name: /Place your product in a scene/});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', {name: 'Product'})).toBeVisible();
    await expect(dialog.getByRole('tab', {name: 'Download'})).toBeVisible();
    await expect(dialog).toContainText('Position and size');
    await expect(dialog).toContainText('Reset position');
    await expect(dialog).not.toContainText('Subjectm');
    await expect(dialog).not.toContainText('Ürün');
    await expect(dialog).not.toContainText('Arka plan');
    await dialog.getByRole('tab', {name: 'Download'}).click();
    await dialog.getByRole('button', {name: 'Download PNG'}).click();
    await expect(dialog.locator('#mc-member')).toBeVisible();
    await expect(dialog.locator('a[href*="/en/login"]')).toHaveCount(1);
  });

});
