import {beforeAll, describe, expect, it} from 'vitest';

let buildPayload: (typeof import('../core'))['buildPayload'];
let toEditorNfcForm: (typeof import('../core'))['toEditorNfcForm'];
let readBusinessTag: (typeof import('../core'))['readBusinessTag'];
let readCompactContactTag: (typeof import('../core'))['readCompactContactTag'];
let buildNfcLocationUrl: (typeof import('../core'))['buildNfcLocationUrl'];
beforeAll(async () => {
  Object.assign(globalThis, {window: {}});
  ({buildPayload, toEditorNfcForm, readBusinessTag, readCompactContactTag, buildNfcLocationUrl} = await import('../core'));
});

describe('WiFi keys', () => {
  const wifi = (encryption: string, password: string) => buildPayload('wifi', {ssid: 'Misafir', encryption, password});

  it('rejects keys phones cannot join with', () => {
    expect(() => wifi('WPA', '1234567')).toThrow('WPA şifresi 8–63 karakter olmalı.');
    expect(() => wifi('WPA', 'x'.repeat(64))).toThrow('WPA şifresi 8–63 karakter olmalı.');
    expect(() => wifi('WEP', '1234')).toThrow(/WEP anahtarı/);
    expect(() => wifi('WEP', '0123456789abcdef')).toThrow(/WEP anahtarı/);
  });

  it('accepts standard WPA and WEP keys', () => {
    expect(wifi('WPA', '12345678')).toContain('P:12345678;');
    expect(wifi('WPA', 'x'.repeat(63))).toContain('T:WPA;');
    expect(wifi('WPA', 'a'.repeat(64))).toContain('T:WPA;'); // 64 hex digits = raw PSK
    for (const key of ['abcde', 'abcdefghijklm', '0123456789', '0123456789abcdef0123456789'])
      expect(wifi('WEP', key)).toContain('T:WEP;');
    expect(buildPayload('wifi', {ssid: 'Açık', encryption: 'nopass'})).toContain('T:nopass;');
  });
});

describe('NFC location tags', () => {
  it('writes a Google Maps link that iPhones open, and reads it back as a location', async () => {
    const url = buildNfcLocationUrl({lat: ' 41.0082 ', lon: '28.9784'});
    expect(url).toBe('https://www.google.com/maps?q=41.0082,28.9784');
    expect(buildNfcLocationUrl({lat: '41.0', lon: '29.0', geoSuffix: ';u=25'})).toBe('https://www.google.com/maps?q=41,29');
    expect(() => buildNfcLocationUrl({lat: '91', lon: '0'})).toThrow(/aralığında/);

    const {decodeNfcForm} = await import('../nfc');
    const bytes = new TextEncoder().encode(url);
    const form = decodeNfcForm([{recordType: 'url', data: new DataView(bytes.buffer)}]);
    expect(form && toEditorNfcForm(form)).toEqual({type: 'location', fields: {lat: '41.0082', lon: '28.9784'}});
  });
});

describe('reading older compact contact tags', () => {
  it('restores the vCard editor fields', async () => {
    const {createCompactNfcRecord} = await import('../nfc');
    const data = createCompactNfcRecord({kind: 'vcard', locale: 'tr', fields: ['Turgut Ürer', '+905551234567', '', 'Renderhane', '']}).data as Uint8Array;
    const record = {recordType: 'renderhane.com:c', data: new DataView(data.buffer, data.byteOffset, data.byteLength)};
    expect(readCompactContactTag([record])).toEqual({
      type: 'vcard',
      fields: {contactMode: 'android', firstName: 'Turgut', lastName: 'Ürer', phone: '+905551234567', org: 'Renderhane'},
    });
    expect(readBusinessTag([record])).toBeNull();
    const bank = createCompactNfcRecord({kind: 'bank', locale: 'tr', fields: ['A', 'TR330006100519786457841326', '', '', '']}).data as Uint8Array;
    expect(readCompactContactTag([{recordType: 'renderhane.com:c', data: new DataView(bank.buffer)}])).toBeNull();
  });
});

describe('reading bank tags back', () => {
  const details = {
    kind: 'bank' as const,
    locale: 'tr' as const,
    fields: ['Örnek Alıcı', 'TR330006100519786457841326', 'Örnek Banka', '', 'Sipariş 42'],
  };
  const view = (value: string | Uint8Array) => {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  };

  it('restores the same fields from link, text and compact tags', async () => {
    const {buildBusinessLandingUrl, formatBusinessText} = await import('@/lib/nfc/business-card');
    const {createCompactNfcRecord} = await import('../nfc');
    const compact = createCompactNfcRecord(details).data as Uint8Array;

    expect(readBusinessTag([{recordType: 'url', data: view(buildBusinessLandingUrl(details))}]))
      .toEqual({details, mode: 'link'});
    expect(readBusinessTag([{recordType: 'text', lang: 'tr', data: view(formatBusinessText(details))}]))
      .toEqual({details, mode: 'standard'});
    expect(readBusinessTag([{recordType: 'renderhane.com:c', data: view(compact)}]))
      .toEqual({details, mode: 'compact'});
  });

  it('leaves ordinary links, text and multi-record tags alone', () => {
    expect(readBusinessTag([{recordType: 'url', data: view('https://www.renderhane.com/tr/araclar/nfc-yaz')}])).toBeNull();
    expect(readBusinessTag([{recordType: 'text', data: view('merhaba')}])).toBeNull();
    expect(readBusinessTag([
      {recordType: 'text', data: view('BANKA BİLGİLERİ\nAlıcı: A\nIBAN: TR330006100519786457841326')},
      {recordType: 'text', data: view('ek')},
    ])).toBeNull();
  });
});

describe('copyable business payloads', () => {
  it('builds bank details as plain copyable text without initiating a payment', () => {
    const payload = buildPayload('bank', {
      accountName: 'Renderhane',
      iban: 'TR33 0006 1005 1978 6457 8413 26',
      bankName: 'Örnek Banka',
      branch: 'Avcılar',
      description: 'Sipariş 42',
    });
    expect(payload).toBe([
      'BANKA BİLGİLERİ',
      'Alıcı: Renderhane',
      'IBAN: TR330006100519786457841326',
      'Banka: Örnek Banka',
      'Şube: Avcılar',
      'Açıklama: Sipariş 42',
    ].join('\n'));
    expect(payload).not.toMatch(/https?:|intent:|bank:/i);
  });

  it('builds localized invoice details as plain copyable text', () => {
    const payload = buildPayload('invoice', {
      title: 'Renderhane',
      taxOffice: 'Avcılar',
      taxNumber: '1234567890',
      address: 'Denizköşkler Mah.\nİstanbul',
      invoiceEmail: 'info@renderhane.com',
    }, 'en');
    expect(payload).toContain('INVOICE DETAILS');
    expect(payload).toContain('Legal name: Renderhane');
    expect(payload).toContain('Address: Denizköşkler Mah. İstanbul');
  });

  it('rejects invalid IBAN and tax identifiers', () => {
    expect(() => buildPayload('bank', {accountName: 'A', iban: '123'})).toThrow('Geçerli bir IBAN');
    expect(() => buildPayload('bank', {accountName: 'A', iban: 'TR4700000000000'})).toThrow('Geçerli bir IBAN');
    expect(() => buildPayload('invoice', {title: 'A', taxNumber: '123', address: 'Adres'})).toThrow('Geçerli bir 10 haneli vergi numarası');
    expect(() => buildPayload('invoice', {title: 'A', taxNumber: '00000000000', address: 'Adres'})).toThrow('Geçerli bir 10 haneli vergi numarası');
    expect(() => buildPayload('invoice', {title: 'A', taxNumber: '1111111111', address: 'Adres'})).toThrow('Geçerli bir 10 haneli vergi numarası');
    expect(buildPayload('invoice', {title: 'A', taxNumber: '1234567890', address: 'Adres'})).toContain('1234567890');
    expect(buildPayload('invoice', {title: 'A', taxNumber: '10000000146', address: 'Adres'})).toContain('10000000146');
  });

  it('rejects malformed optional business email addresses', () => {
    expect(() => buildPayload('invoice', {title: 'A', taxNumber: '1234567890', address: 'Adres', invoiceEmail: 'not-an-email'})).toThrow('Geçerli bir e-posta');
    expect(() => buildPayload('vcard', {firstName: 'A', email: 'not-an-email'})).toThrow('Geçerli bir e-posta');
  });

  it('maps scanned app and geo records to the editor field schema', () => {
    expect(toEditorNfcForm({type: 'app', fields: {packageName: 'com.renderhane.app'}})).toEqual({
      type: 'app', fields: {package: 'com.renderhane.app'},
    });
    expect(toEditorNfcForm({type: 'url', fields: {url: 'geo:41.0082,28.9784'}})).toEqual({
      type: 'location', fields: {lat: '41.0082', lon: '28.9784', geoSuffix: ''},
    });
    expect(toEditorNfcForm({type: 'url', fields: {url: 'geo:1e-7,-2.5E+3'}})).toEqual({
      type: 'location', fields: {lat: '1e-7', lon: '-2.5E+3', geoSuffix: ''},
    });
    const parameterized = toEditorNfcForm({
      type: 'url', fields: {url: 'geo:41.0,29.0;u=25'},
    });
    expect(parameterized).toEqual({
      type: 'location', fields: {lat: '41.0', lon: '29.0', geoSuffix: ';u=25'},
    });
    expect(buildPayload(parameterized.type, parameterized.fields)).toBe('geo:41,29;u=25');
  });

  it('builds a standards-compatible Android vCard with separate name fields', () => {
    const payload = buildPayload('vcard', {
      contactMode: 'android',
      firstName: 'Turgut',
      lastName: 'Ürer',
      phone: '+90 555 123 45 67',
    });
    expect(payload).toContain('N:Ürer;Turgut;;;');
    expect(payload).toContain('FN:Turgut Ürer');
    expect(payload).toContain('TEL;TYPE=CELL:+905551234567');
  });

  it('rejects invalid dot-atom email addresses in Android contact cards', () => {
    expect(() => buildPayload('vcard', {
      contactMode: 'android', firstName: 'Ada', email: 'a..b@example.com',
    })).toThrow(/e-posta/);
  });

  it('rejects non-Instagram destinations in Android contact cards', () => {
    expect(() => buildPayload('vcard', {
      contactMode: 'android', firstName: 'Ada', instagram: 'https://x.com/renderhane',
    })).toThrow(/resmi bağlantı/);
  });

  it('rejects malformed WhatsApp values in Android contact cards', () => {
    expect(() => buildPayload('vcard', {
      contactMode: 'android', firstName: 'Ada', whatsapp: '+90 555 O23 45 67',
    })).toThrow(/WhatsApp numarasını/);
    expect(() => buildPayload('vcard', {
      contactMode: 'android', firstName: 'Ada', whatsapp: '05551234567',
    })).toThrow(/WhatsApp numarasını/);
  });

  it('preserves extended Android contact fields when rebuilding a scanned card', () => {
    const payload = buildPayload('vcard', {
      contactMode: 'android', firstName: 'Ada', title: 'Engineer',
      address: 'London', instagram: '@renderhane', whatsapp: '+905551234567',
    });
    expect(payload).toContain('TITLE:Engineer');
    expect(payload).toContain('ADR;TYPE=WORK:;;London;;;;');
    expect(payload).toContain('item1.URL:https://www.instagram.com/renderhane');
    expect(payload).toContain('item2.URL:https://wa.me/905551234567');
  });

  it('builds iPhone/Android contact and social landing links', () => {
    expect(buildPayload('vcard', {
      contactMode: 'linked',
      firstName: 'Turgut',
      lastName: 'Ürer',
    })).toContain('/tr/k?');
    expect(buildPayload('social', {
      socialMode: 'single',
      platform: 'instagram',
      socialValue: '@renderhane',
    })).toBe('https://www.instagram.com/renderhane');
    expect(buildPayload('social', {
      socialMode: 'card',
      instagram: '@renderhane',
      whatsapp: '+905551234567',
    })).toContain('/tr/s?');
    expect(buildPayload('vcard', {
      contactMode: 'linked',
      shareLocale: 'en',
      firstName: 'Ada',
    }, 'tr')).toContain('/en/k?');
    expect(buildPayload('social', {
      socialMode: 'card',
      shareLocale: 'en',
      instagram: '@renderhane',
      whatsapp: '+905551234567',
    }, 'tr')).toContain('/en/s?');
  });
});
