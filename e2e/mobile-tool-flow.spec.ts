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
    const guide = page.locator('section[aria-label="Kullanım Rehberi ve SSS"]');
    await expect(guide).toBeVisible();
    expect(await guide.evaluate(element => {
      const footer = document.querySelector('footer');
      return Boolean(footer && (element.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);
  });

  test('SEO guide follows the tool workspace layout in light and dark modes', async ({page}) => {
    await page.goto('/tr/araclar/qr-kod');
    const guide = page.locator('section[aria-label="Kullanım Rehberi ve SSS"]');
    await expect(guide).toBeVisible();
    await expect(page.locator('.rh-app main')).toBeVisible();

    const layout = await page.evaluate(() => {
      const workspace = document.querySelector('.rh-app main');
      const guide = document.querySelector('.rh-guide-surface .tool-guide');
      if (!workspace || !guide) return null;
      const workspaceRect = workspace.getBoundingClientRect();
      const guideRect = guide.getBoundingClientRect();
      return {
        leftDifference: Math.abs(workspaceRect.left - guideRect.left),
        widthDifference: Math.abs(workspaceRect.width - guideRect.width),
        fontMatches: getComputedStyle(workspace).fontFamily === getComputedStyle(guide).fontFamily,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(layout).not.toBeNull();
    expect(layout?.leftDifference).toBeLessThanOrEqual(1);
    expect(layout?.widthDifference).toBeLessThanOrEqual(1);
    expect(layout?.fontMatches).toBe(true);
    expect(layout?.overflow).toBe(false);

    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.locator('.rh-guide-surface')).toHaveCSS('background-color', 'rgb(20, 17, 38)');
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
    await expect(page.locator('.rh-qr-check-scope')).toContainText('Data is read from the known grid of the SVG and downloadable PNG.');
    await expect(page.locator('.rh-qr-check-scope')).not.toContainText('SVG görüntüsünün');
    await expect(page.locator('#rh-qr-check')).toHaveAttribute('data-state', 'passed');
    await expect(page.locator('#rh-qr-svg svg')).toHaveAttribute('aria-label', 'Classic-style QR code');
    await expect(page.locator('#rh-qr-svg title')).toHaveText('Renderhane · Classic QR');
    await expect(page.locator('#rh-qr-svg desc')).toContainText('Preserve the quiet zone');
    await expect(page.locator('body')).not.toContainText('Fikir kategorisi');
  });


  test('English NFC opens with a localized safe fallback', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/en/araclar/nfc-yaz');
    await expect(page.locator('main#rh-main')).toBeVisible();
    await expect(page.locator('#rh-nfc-status')).toContainText('NFC');
    await expect(page.locator('body')).not.toContainText('Maximum call stack size exceeded');

    await page.getByRole('button', {name: 'Dark mode'}).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('.rh-app')).toHaveCSS('background-color', 'rgb(20, 17, 38)');
    await expect(page.locator('.rh-page-heading h1')).toHaveCSS('color', 'rgb(236, 234, 246)');
    await expect(page.locator('.rh-field label').first()).toHaveCSS('color', 'rgb(167, 163, 192)');
    await expect(page.locator('.rh-idea-card h3').first()).toHaveCSS('color', 'rgb(236, 234, 246)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test('English background removal preserves filenames and selects English API errors', async ({page}) => {
    let calls = 0;
    await page.route('**/api/demo/bg-remove', async route => {
      calls++;
      if (calls === 1) {
        await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({resultUrl: '/launch-preview/tools/cutout.png', remaining: 2})});
        return;
      }
      await route.fulfill({status: 429, contentType: 'application/json', body: JSON.stringify({errorTr: 'Günlük ücretsiz kullanım sınırına ulaşıldı.', error: 'Daily free limit reached.'})});
    });
    await page.goto('/en/araclar/arka-plan-kaldirma');
    await page.locator('input[data-file]').setInputFiles({
      name: 'Telefon-Mesaj.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4ZsAAAAASUVORK5CYII=', 'base64'),
    });
    await expect(page.getByRole('button', {name: 'Remove background'})).toBeEnabled();
    await page.getByRole('button', {name: 'Remove background'}).click();
    await expect(page.locator('#rh-bg-status')).toHaveText('Processing completed. Review the result before downloading.');
    await expect(page.locator('#rh-canvas .rh-panel-title')).toContainText('Telefon-Mesaj.png');
    await expect(page.locator('#rh-canvas .rh-panel-title')).not.toContainText('Phone-Message.png');

    await page.getByRole('button', {name: 'Remove background'}).click();
    await expect(page.locator('#rh-bg-status')).toHaveText('Daily free limit reached.');
    await expect(page.locator('#rh-bg-status')).not.toContainText('Günlük');
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
