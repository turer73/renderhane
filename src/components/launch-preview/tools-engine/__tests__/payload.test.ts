import {beforeAll, describe, expect, it} from 'vitest';

let buildPayload: (typeof import('../core'))['buildPayload'];
let toEditorNfcForm: (typeof import('../core'))['toEditorNfcForm'];
beforeAll(async () => {
  Object.assign(globalThis, {window: {}});
  ({buildPayload, toEditorNfcForm} = await import('../core'));
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
      type: 'location', fields: {lat: '41.0082', lon: '28.9784'},
    });
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
    expect(payload).toContain('TEL:+905551234567');
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
  });
});
