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

  test('tool page has only the document vertical scrollbar', async ({page}) => {
    await page.setViewportSize({width: 720, height: 900});
    await page.goto('/tr/araclar/nfc-yaz');
    await expect(page.locator('.rh-guide-surface')).toBeVisible();

    const scroll = await page.evaluate(() => {
      window.scrollTo({top: 400, behavior: 'instant'});
      return {
        rootOverflowY: getComputedStyle(document.documentElement).overflowY,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        rootScrollHeight: document.documentElement.scrollHeight,
        viewportHeight: document.documentElement.clientHeight,
        windowScrollY: window.scrollY,
        bodyScrollTop: document.body.scrollTop,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(scroll.rootOverflowY).toBe('visible');
    expect(scroll.bodyOverflowY).toBe('visible');
    expect(scroll.rootScrollHeight).toBeGreaterThan(scroll.viewportHeight);
    expect(scroll.windowScrollY).toBeGreaterThan(0);
    expect(scroll.bodyScrollTop).toBe(0);
    expect(scroll.horizontalOverflow).toBe(false);
  });

  test('NFC supports irreversible locking and guided bulk writing', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {
        NDEFReader?: typeof FakeNDEFReader;
        __nfcWrites?: number;
        __nfcLocks?: number;
        __nfcPayloads?: string[];
      };
      type FakeRecord = {recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array};
      class FakeNDEFReader {
        static records: FakeRecord[] = [];
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(message: {records: readonly FakeRecord[]}): Promise<void> {
          state.__nfcWrites = (state.__nfcWrites || 0) + 1;
          state.__nfcPayloads ||= [];
          state.__nfcPayloads.push(JSON.stringify(message));
          FakeNDEFReader.records = Array.from(message.records);
        }
        async makeReadOnly(): Promise<void> { state.__nfcLocks = (state.__nfcLocks || 0) + 1; }
        async scan(): Promise<void> {
          queueMicrotask(() => this.onreading?.({message: {records: FakeNDEFReader.records.map(record => {
            const bytes = typeof record.data === 'string' ? new TextEncoder().encode(record.data) : record.data;
            return {...record, data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)};
          })}} as unknown as Event));
        }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
      state.confirm = () => true;
    });
    await page.goto('/tr/araclar/nfc-yaz');

    const lock = page.locator('#rh-nfc-lock');
    await expect(lock).toBeEnabled();
    await lock.check();
    await page.locator('#rh-nfc-bulk-count').fill('2');
    await page.getByRole('button', {name: /Toplu yazımı başlat/}).click();
    await expect(page.locator('.rh-nfc-bulk-progress')).toContainText('0/2');

    await page.getByRole('button', {name: /Sıradaki etiketi yaz/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('1/2 etiket yazıldı ve kalıcı kilitlendi');
    await page.locator('#rh-nfc-url').fill('https://changed.example');
    await page.getByRole('button', {name: /Sıradaki etiketi yaz/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Toplu yazım tamamlandı: 2/2 etiket yazıldı ve 2 etiket kalıcı kilitlendi');

    expect(await page.evaluate(() => ({
      writes: (window as Window & {__nfcWrites?: number}).__nfcWrites,
      locks: (window as Window & {__nfcLocks?: number}).__nfcLocks,
      payloads: (window as Window & {__nfcPayloads?: string[]}).__nfcPayloads,
    }))).toEqual({writes: 2, locks: 2, payloads: expect.arrayContaining([expect.any(String), expect.any(String)])});
    const payloads = await page.evaluate(() => (window as Window & {__nfcPayloads?: string[]}).__nfcPayloads || []);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toBe(payloads[0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test('NFC writes contact cards as standard vCard records that Android Contacts can open', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader; __contactRecords?: Array<{recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array}>};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(message: {records: Array<{recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array}>}): Promise<void> {
          state.__contactRecords = message.records;
        }
        async scan(): Promise<void> {
          queueMicrotask(() => this.onreading?.({
            serialNumber: 'standard-contact-test',
            message: {
              records: (state.__contactRecords || []).map(record => {
                const bytes = typeof record.data === 'string' ? new TextEncoder().encode(record.data) : record.data;
                return {...record, data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)};
              }),
            },
          } as unknown as Event));
        }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
    });
    await page.goto('/tr/araclar/nfc-yaz');
    await page.locator('[data-nfc-type="vcard"]').click();
    await page.locator('#rh-nfc-firstName').fill('Turgut');
    await page.locator('#rh-nfc-lastName').fill('Ürer');
    await page.locator('#rh-nfc-phone').fill('+905551234567');
    await page.locator('#rh-nfc-email').fill('turgut.urer@gmail.com');
    await page.locator('#rh-nfc-org').fill('Renderhane');
    await page.locator('#rh-nfc-website').fill('https://renderhane.com');

    await expect(page.locator('.rh-contact-name')).toHaveText('Turgut Ürer');
    await expect(page.locator('.rh-contact-phone')).toHaveText('+905551234567');
    await expect(page.locator('.rh-contact-details')).toContainText('turgut.urer@gmail.com');
    await expect(page.locator('.rh-contact-details')).toContainText('Renderhane');
    await expect(page.locator('.rh-contact-details')).toContainText('https://renderhane.com');
    await expect(page.locator('.rh-contact-preview')).toBeVisible();

    await expect(page.locator('#rh-nfc-capacity')).toHaveValue('ntag213');
    await expect(page.locator('.rh-nfc-capacity')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('.rh-nfc-capacity')).toContainText('NTAG215 seç.');
    await expect(page.locator('.rh-nfc-storage')).toHaveCount(0);
    await expect(page.locator('[data-action="nfc-write"]')).toBeDisabled();

    await page.locator('#rh-nfc-capacity').selectOption('ntag215');
    await expect(page.locator('.rh-nfc-capacity')).toHaveAttribute('data-state', 'success');
    await expect(page.locator('[data-action="nfc-write"]')).toBeEnabled();
    await page.locator('[data-action="nfc-write"]').click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiket yazıldı.');

    const record = await page.evaluate(() => {
      const value = (window as Window & {__contactRecords?: Array<{recordType: string; mediaType?: string}>}).__contactRecords?.[0];
      return value && {recordType: value.recordType, mediaType: value.mediaType};
    });
    expect(record).toEqual({recordType: 'mime', mediaType: 'text/vcard'});

    await page.locator('[data-action="nfc-scan"]').click();
    await expect(page.locator('.rh-nfc-read-result')).toContainText('BEGIN:VCARD');
    await expect(page.locator('.rh-nfc-read-result')).toContainText('FN:Turgut Ürer');
    await expect(page.locator('.rh-nfc-read-result')).toContainText('EMAIL:turgut.urer@gmail.com');
    await expect(page.locator('.rh-nfc-read-result')).toContainText('URL:https://renderhane.com/');

    await page.locator('[data-nfc-type="url"]').click();
    await page.locator('[data-nfc-type="vcard"]').click();
    await expect(page.locator('.rh-nfc-storage')).toHaveCount(0);

    await page.reload();
    await page.locator('[data-nfc-type="vcard"]').click();
    await expect(page.locator('.rh-nfc-storage')).toHaveCount(0);
  });

  test('NFC validates direct social links and builds a stateless multi-network card', async ({page}) => {
    await page.goto('/tr/araclar/nfc-yaz');
    await page.locator('[data-nfc-type="social"]').click();
    await page.locator('#rh-nfc-socialValue').fill('@renderhane');
    await expect(page.locator('#rh-nfc-social-check')).toHaveAttribute('data-state', 'valid');
    await expect(page.locator('#rh-nfc-social-check')).toContainText('https://www.instagram.com/renderhane');

    await page.locator('#rh-nfc-socialMode').selectOption('card');
    await page.locator('#rh-nfc-instagram').fill('@renderhane');
    await page.locator('#rh-nfc-whatsapp').fill('+90 555 123 45 67');
    await expect(page.locator('#rh-nfc-social-check')).toHaveAttribute('data-state', 'valid');
    await expect(page.locator('#rh-nfc-social-check')).toContainText('/tr/s?');
    await expect(page.locator('.rh-nfc-capacity')).not.toHaveAttribute('data-state', 'error');
  });

  test('linked social and contact cards open safely on mobile', async ({page, request}) => {
    await page.goto('/tr/s?n=Renderhane&i=renderhane&w=905551234567');
    await expect(page.getByRole('heading', {name: 'Renderhane'})).toBeVisible();
    await expect(page.getByRole('link', {name: /Instagram/})).toHaveAttribute('href', 'https://www.instagram.com/renderhane');
    await expect(page.getByRole('link', {name: /WhatsApp/})).toHaveAttribute('href', 'https://wa.me/905551234567');

    await page.goto('/tr/k?n=Turgut&s=%C3%9Crer&p=%2B905551234567&e=turgut.urer%40gmail.com');
    await expect(page.getByRole('heading', {name: 'Turgut Ürer'})).toBeVisible();
    await expect(page.getByRole('link', {name: 'Kişilere ekle'})).toBeVisible();
    const card = await request.get('/api/contact-card?n=Turgut&s=%C3%9Crer&p=%2B905551234567');
    expect(card.ok()).toBe(true);
    expect(card.headers()['content-type']).toContain('text/vcard');
    expect(await card.text()).toContain('N:Ürer;Turgut;;;');
  });

  test('NFC bank details default to a copyable page and fall back to a compact record', async ({page}) => {
    await page.addInitScript(() => {
      type FakeRecord = {recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array};
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader; __nfcRecords?: FakeRecord[]};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(message: {records: FakeRecord[]}): Promise<void> {
          state.__nfcRecords = message.records;
        }
        async scan(): Promise<void> {
          queueMicrotask(() => this.onreading?.({
            serialNumber: 'fake-tag',
            message: {
              records: (state.__nfcRecords || []).map(record => {
                const bytes = typeof record.data === 'string' ? new TextEncoder().encode(record.data) : record.data;
                return {...record, data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)};
              }),
            },
          } as unknown as Event));
        }
      }
      state.NDEFReader = FakeNDEFReader;
    });
    // A "standard" choice saved by the pre-link version must not override the copyable page.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('renderhane:nfc-storage-mode', 'standard');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('/tr/araclar/nfc-yaz');
    await page.locator('[data-nfc-type="bank"]').click();
    await expect(page.locator('.rh-nfc-storage input[name="rh-nfc-storage"][value="link"]')).toBeChecked();
    await page.locator('#rh-nfc-accountName').fill('Örnek Alıcı');
    await page.locator('#rh-nfc-iban').fill('TR20 0000 0000 0000 0000 0000 01');
    await page.locator('#rh-nfc-bankName').fill('Test Bankası');
    await page.locator('#rh-nfc-branch').fill('Demo Şube');
    await page.locator('#rh-nfc-description').fill('Sentetik test ödemesi');

    // All five fields overflow an NTAG213 as a page link: suggest a larger tag, not compact.
    await expect(page.locator('.rh-nfc-capacity')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('.rh-nfc-capacity')).toContainText('NTAG215 seç.');
    await expect(page.locator('.rh-nfc-storage-recommended')).toHaveCount(0);
    await page.locator('.rh-nfc-storage input[name="rh-nfc-storage"][value="compact"]').check();
    await expect(page.locator('.rh-nfc-storage input[name="rh-nfc-storage"][value="compact"]')).toBeChecked();
    await expect(page.locator('.rh-nfc-capacity')).toHaveAttribute('data-state', 'success');
    await expect(page.locator('[data-action="nfc-write"]')).toBeEnabled();

    await page.locator('[data-action="nfc-write"]').click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiket yazıldı.');
    await page.locator('[data-action="nfc-scan"]').click();
    const rows = page.locator('.rh-nfc-read-fields li');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(1)).toContainText('TR20 0000 0000 0000 0000 0000 01');
    await expect(page.locator('[data-action="nfc-copy-field"]')).toHaveCount(5);
    await expect(page.locator('[data-action="nfc-copy-read"]')).toBeVisible();
    expect(await page.locator('.rh-nfc-storage').evaluate(element => element.getBoundingClientRect().right <= innerWidth + 1)).toBe(true);

    await page.locator('[data-nfc-type="url"]').click();
    await page.locator('[data-nfc-type="bank"]').click();
    await expect(page.locator('.rh-nfc-storage input[name="rh-nfc-storage"][value="compact"]')).toBeChecked();

    await page.reload();
    await page.locator('[data-nfc-type="bank"]').click();
    await expect(page.locator('.rh-nfc-storage input[name="rh-nfc-storage"][value="compact"]')).toBeChecked();
  });

  test('NFC bank page link opens a copy button for every detail', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      type FakeRecord = {recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array};
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader; __nfcRecords?: FakeRecord[]};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(message: {records: FakeRecord[]}): Promise<void> {
          state.__nfcRecords = message.records;
        }
        async scan(): Promise<void> {
          queueMicrotask(() => this.onreading?.({
            serialNumber: 'fake-tag',
            message: {
              records: (state.__nfcRecords || []).map(record => {
                const bytes = typeof record.data === 'string' ? new TextEncoder().encode(record.data) : record.data;
                return {...record, data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)};
              }),
            },
          } as unknown as Event));
        }
      }
      state.NDEFReader = FakeNDEFReader;
    });
    await page.goto('/tr/araclar/nfc-yaz');
    await page.locator('[data-nfc-type="bank"]').click();
    await page.locator('#rh-nfc-accountName').fill('Örnek Alıcı');
    await page.locator('#rh-nfc-iban').fill('TR20 0000 0000 0000 0000 0000 01');
    await page.locator('#rh-nfc-bankName').fill('Test Bankası');
    await expect(page.locator('.rh-nfc-capacity')).toHaveAttribute('data-state', 'success');

    await page.locator('[data-action="nfc-write"]').click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiket yazıldı.');
    const written = await page.evaluate(() => (window as Window & {__nfcRecords?: Array<{recordType: string; data: string}>}).__nfcRecords);
    expect(written).toHaveLength(1);
    expect(written?.[0]?.recordType).toBe('url');
    const link = new URL(written![0]!.data);
    expect(`${link.origin}${link.pathname}`).toBe('https://www.renderhane.com/tr/b');
    expect(link.search).toBe('');

    // In-tool read: each field gets its own copy button.
    await page.locator('[data-action="nfc-scan"]').click();
    await expect(page.locator('.rh-nfc-read-fields li')).toHaveCount(3);
    await page.locator('[data-action="nfc-copy-field"]').nth(1).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('TR200000000000000000000001');

    // What a phone that taps the tag opens.
    await page.goto(`/tr/b${link.hash}`);
    await expect(page.getByRole('heading', {name: 'Örnek Alıcı'})).toBeVisible();
    await expect(page.getByText('TR20 0000 0000 0000 0000 0000 01')).toBeVisible();
    await page.getByRole('button', {name: 'IBAN kopyala'}).click();
    await expect(page.getByRole('button', {name: 'IBAN kopyala'})).toContainText('Kopyalandı');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('TR200000000000000000000001');
    await page.getByRole('button', {name: 'Banka kopyala'}).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Test Bankası');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    await page.goto('/tr/b#n=Eksik');
    await expect(page.getByRole('heading', {name: 'Bilgiler okunamadı'})).toBeVisible();
  });

  test('NFC writes WiFi as a WSC record and reads it back without printing the password', async ({page}) => {
    await page.addInitScript(() => {
      type FakeRecord = {recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array};
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader; __nfcRecords?: FakeRecord[]};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(message: {records: FakeRecord[]}): Promise<void> {
          state.__nfcRecords = message.records;
        }
        async scan(): Promise<void> {
          queueMicrotask(() => this.onreading?.({
            serialNumber: 'fake-tag',
            message: {
              records: (state.__nfcRecords || []).map(record => {
                const bytes = typeof record.data === 'string' ? new TextEncoder().encode(record.data) : record.data;
                return {...record, data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)};
              }),
            },
          } as unknown as Event));
        }
      }
      state.NDEFReader = FakeNDEFReader;
    });
    await page.goto('/tr/araclar/nfc-yaz');
    await page.locator('[data-nfc-type="wifi"]').click();
    await page.locator('#rh-nfc-ssid').fill('Misafir');
    await page.locator('#rh-nfc-password').fill('gizli-sifre-123');
    await expect(page.locator('#rh-nfc-preview')).toContainText('WiFi · Misafir');
    await expect(page.locator('#rh-nfc-preview')).not.toContainText('gizli-sifre-123');
    await expect(page.locator('[data-action="nfc-write"]')).toBeEnabled();

    await page.locator('[data-action="nfc-write"]').click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiket yazıldı.');
    const written = await page.evaluate(() => (window as Window & {__nfcRecords?: Array<{recordType: string; mediaType?: string}>}).__nfcRecords?.map(r => ({recordType: r.recordType, mediaType: r.mediaType})));
    expect(written).toEqual([{recordType: 'mime', mediaType: 'application/vnd.wfa.wsc'}]);

    await page.locator('[data-nfc-type="url"]').click();
    await page.locator('[data-action="nfc-scan"]').click();
    await expect(page.locator('.rh-nfc-read-result')).toContainText('Ağ: Misafir');
    await expect(page.locator('.rh-nfc-read-result')).not.toContainText('gizli-sifre-123');
    await expect(page.locator('#rh-nfc-ssid')).toHaveValue('Misafir');
    await expect(page.locator('#rh-nfc-password')).toHaveValue('gizli-sifre-123');
  });

  test('NFC IO failure opens an actionable error dialog without leaking null', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(): Promise<void> { throw new DOMException('Failed to write due to an IO error: null', 'NetworkError'); }
        async scan(): Promise<void> {}
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
    });
    await page.goto('/tr/araclar/nfc-yaz');
    await page.getByRole('button', {name: /^Etikete yaz$/}).click();

    const dialog = page.locator('#rh-nfc-error-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Etikete yazılamadı');
    await expect(dialog).toContainText('üzerine yaz');
    await expect(dialog).not.toContainText('null');
    await dialog.getByRole('button', {name: 'Tamam'}).click();
    await expect(dialog).not.toBeVisible();
  });

  test('NFC scan errors use read guidance instead of write guidance', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(): Promise<void> {}
        async scan(): Promise<void> { throw new DOMException('Cannot decode record', 'DataError'); }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
    });
    await page.goto('/tr/araclar/nfc-yaz');
    await page.getByRole('button', {name: /^Etiketi oku$/}).click();

    const dialog = page.locator('#rh-nfc-error-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('NFC etiketi okunamadı');
    await expect(dialog).not.toContainText('yazılamadı');
  });

  test('NFC lock timeout preserves bulk progress and blocks type changes while busy', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader};
      type FakeRecord = {recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array};
      class FakeNDEFReader {
        static records: FakeRecord[] = [];
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(message: {records: readonly FakeRecord[]}): Promise<void> { FakeNDEFReader.records = Array.from(message.records); }
        async makeReadOnly(): Promise<void> { await new Promise<void>(() => {}); }
        async scan(): Promise<void> {
          queueMicrotask(() => this.onreading?.({message: {records: FakeNDEFReader.records.map(record => {
            const bytes = typeof record.data === 'string' ? new TextEncoder().encode(record.data) : record.data;
            return {...record, data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)};
          })}} as unknown as Event));
        }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
      state.confirm = () => true;
    });
    await page.goto('/tr/araclar/nfc-yaz');
    await page.clock.install();

    await page.locator('#rh-nfc-lock').check();
    await page.locator('#rh-nfc-bulk-count').fill('2');
    await page.getByRole('button', {name: /Toplu yazımı başlat/}).click();
    await page.getByRole('button', {name: /Sıradaki etiketi yaz/}).click();
    expect(await page.locator('[data-nfc-type]').evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).disabled))).toBe(true);
    await expect(page.locator('#rh-nfc-lock')).toBeDisabled();
    await expect(page.locator('#rh-nfc-url')).toBeDisabled();
    await expect(page.locator('#rh-nfc-overwrite')).toBeDisabled();

    await page.clock.fastForward(30_000);
    await expect(page.locator('#rh-nfc-status')).toContainText('1/2 etiket yazıldı');
    await expect(page.locator('#rh-nfc-status')).toContainText('Kalıcı kilit zaman aşımına uğradı; kilit durumu doğrulanamadı.');
    await expect(page.locator('.rh-nfc-bulk-progress')).toContainText('1/2');
    await expect(page.locator('[data-nfc-type="url"]')).toBeEnabled();

    await page.getByRole('button', {name: /Sıradaki etiketi yaz/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('kalıcı kilit uygulanıyor');
    await page.getByRole('button', {name: /^Durdur$/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Toplu yazım tamamlandı: 2/2 etiket yazıldı; 0 kilitlendi, 2 kilitlenemedi.');
    await expect(page.locator('#rh-nfc-status')).toContainText('İşlem durduruldu; etiket yazıldıysa kilit durumu doğrulanamadı.');
  });

  test('NFC refuses permanent locking when read-back differs from the written NDEF', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader; __nfcLocks?: number};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(): Promise<void> {}
        async makeReadOnly(): Promise<void> { state.__nfcLocks = (state.__nfcLocks || 0) + 1; }
        async scan(): Promise<void> {
          const bytes = new TextEncoder().encode('https://wrong.example');
          queueMicrotask(() => this.onreading?.({message: {records: [{recordType: 'url', data: new DataView(bytes.buffer)}]}} as unknown as Event));
        }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
      state.confirm = () => true;
    });
    await page.goto('/tr/araclar/nfc-yaz');

    await page.locator('#rh-nfc-lock').check();
    await page.getByRole('button', {name: /^Etikete yaz$/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiketten geri okunan içerik yazılan NDEF ile eşleşmedi; kalıcı kilit uygulanmadı.');
    expect(await page.evaluate(() => (window as Window & {__nfcLocks?: number}).__nfcLocks || 0)).toBe(0);
  });

  test('NFC verifies unlocked writes and rejects mismatched read-back', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(): Promise<void> {}
        async scan(): Promise<void> {
          const bytes = new TextEncoder().encode('https://wrong.example');
          queueMicrotask(() => this.onreading?.({message: {records: [{recordType: 'url', data: new DataView(bytes.buffer)}]}} as unknown as Event));
        }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
    });
    await page.goto('/tr/araclar/nfc-yaz');

    await page.getByRole('button', {name: /^Etikete yaz$/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiket yazıldı ancak içerik doğrulanamadı');
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiketten geri okunan içerik yazılan NDEF ile eşleşmedi');
  });

  test('NFC refuses locking when text language metadata is missing', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader; __nfcLocks?: number};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(): Promise<void> {}
        async makeReadOnly(): Promise<void> { state.__nfcLocks = (state.__nfcLocks || 0) + 1; }
        async scan(): Promise<void> {
          const bytes = new TextEncoder().encode('Merhaba');
          queueMicrotask(() => this.onreading?.({message: {records: [{recordType: 'text', data: new DataView(bytes.buffer)}]}} as unknown as Event));
        }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
      state.confirm = () => true;
    });
    await page.goto('/tr/araclar/nfc-yaz');

    await page.locator('[data-nfc-type="text"]').click();
    await page.locator('#rh-nfc-text').fill('Merhaba');
    await page.locator('#rh-nfc-lock').check();
    await page.getByRole('button', {name: /^Etikete yaz$/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('Etiketten geri okunan içerik yazılan NDEF ile eşleşmedi');
    expect(await page.evaluate(() => (window as Window & {__nfcLocks?: number}).__nfcLocks || 0)).toBe(0);
  });

  test('NFC records an empty lock rejection as a failure', async ({page}) => {
    await page.addInitScript(() => {
      const state = window as Window & {NDEFReader?: typeof FakeNDEFReader};
      class FakeNDEFReader {
        onreading: ((event: Event) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        async write(): Promise<void> {}
        async makeReadOnly(): Promise<void> { throw new DOMException('', 'NetworkError'); }
        async scan(): Promise<void> {
          const bytes = new TextEncoder().encode('https://renderhane.com/');
          queueMicrotask(() => this.onreading?.({message: {records: [{recordType: 'url', data: new DataView(bytes.buffer)}]}} as unknown as Event));
        }
      }
      Object.defineProperty(state, 'NDEFReader', {configurable: true, value: FakeNDEFReader});
      state.confirm = () => true;
    });
    await page.goto('/tr/araclar/nfc-yaz');

    await page.locator('#rh-nfc-lock').check();
    await page.getByRole('button', {name: /^Etikete yaz$/}).click();
    await expect(page.locator('#rh-nfc-status')).toContainText('İçerik yazıldı ancak etiket kalıcı kilitlenemedi: Kilit işlemi tamamlanmadı.');
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
