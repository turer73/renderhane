import {describe, expect, it, vi} from 'vitest';
import {
  NFC_CHIP_PROFILES,
  checkNfcCapacity,
  createCompactNfcRecord,
  createWebNfcAdapter,
  decodeCompactNfcRecord,
  decodeNfcForm,
  decodeNfcRecord,
  estimateNdefStorageBytes,
  formatCompactNfcDetails,
  nfcReadErrorMessage,
  nfcWriteErrorMessage,
  profilesForForumType,
  profilesForTransport,
  supportsGenericWebNdef,
  type WebNfcWindow,
} from '../nfc';

describe('NFC chip platform', () => {
  it('stores structured bank details compactly and restores copyable text', () => {
    const details = {
      kind: 'bank' as const,
      locale: 'tr' as const,
      fields: ['Örnek Alıcı', 'TR200000000000000000000001', 'Test Bankası', 'Demo Şube', 'Sentetik test ödemesi'],
    };
    const text = formatCompactNfcDetails(details);
    const standard = [{recordType: 'text', lang: 'tr', data: text}];
    const compact = [createCompactNfcRecord(details)];

    expect(estimateNdefStorageBytes(compact)).toBeLessThan(estimateNdefStorageBytes(standard));
    expect(checkNfcCapacity(standard, 'ntag213').fits).toBe(false);
    expect(checkNfcCapacity(compact, 'ntag213').fits).toBe(true);

    const stored = compact[0]!.data as Uint8Array;
    const decoded = decodeCompactNfcRecord({
      recordType: compact[0]!.recordType,
      data: new DataView(stored.buffer, stored.byteOffset, stored.byteLength),
    });
    expect(decoded).toEqual(details);
    expect(formatCompactNfcDetails(decoded!)).toBe(text);
  });

  it('stores every contact field in a compact record and rebuilds a copyable vCard', () => {
    const details = {
      kind: 'vcard' as const,
      locale: 'tr' as const,
      fields: ['Turgut Ürer', '+905551234567', 'turgut.urer@gmail.com', 'Renderhane', 'https://renderhane.com/'],
    };
    const compact = [createCompactNfcRecord(details)];
    expect(checkNfcCapacity(compact, 'ntag213').fits).toBe(true);

    const stored = compact[0]!.data as Uint8Array;
    const decoded = decodeCompactNfcRecord({
      recordType: compact[0]!.recordType,
      data: new DataView(stored.buffer, stored.byteOffset, stored.byteLength),
    });
    expect(decoded).toEqual(details);
    expect(formatCompactNfcDetails(decoded!)).toBe([
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Turgut Ürer', 'N:;Turgut Ürer;;;',
      'TEL:+905551234567', 'EMAIL:turgut.urer@gmail.com', 'ORG:Renderhane',
      'URL:https://renderhane.com/', 'END:VCARD',
    ].join('\r\n'));
  });

  it('rejects truncated Renderhane compact records without treating them as text', () => {
    expect(() => decodeCompactNfcRecord({
      recordType: 'renderhane.com:c',
      data: new DataView(Uint8Array.from([1, 1, 20, 65]).buffer),
    })).toThrow(/eksik/);
    expect(decodeCompactNfcRecord({
      recordType: 'text',
      data: new DataView(new TextEncoder().encode('normal').buffer),
    })).toBeNull();
  });

  it('estimates Type 2 NDEF storage and blocks an oversized NTAG213 vCard', () => {
    const url = [{recordType: 'url', data: 'https://renderhane.com'}];
    expect(estimateNdefStorageBytes(url)).toBe(27);
    expect(checkNfcCapacity(url, 'ntag213')).toMatchObject({estimatedBytes: 27, capacityBytes: 132, remainingBytes: 105, fits: true});

    const vcard = new TextEncoder().encode([
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Turgut Ürer', 'N:;Turgut Ürer;;;',
      'TEL:+905551234567', 'EMAIL:turgut.urer@gmail.com', 'ORG:Renderhane',
      'URL:https://renderhane.com', 'END:VCARD',
    ].join('\r\n'));
    const records = [{recordType: 'mime', mediaType: 'text/vcard', data: vcard}];
    const check = checkNfcCapacity(records, 'ntag213');
    expect(check.estimatedBytes).toBeGreaterThan(132);
    expect(check.fits).toBe(false);
    expect(checkNfcCapacity(records, 'ntag215').fits).toBe(true);
  });

  it('restores UTF-16 NDEF text without mojibake', () => {
    const utf16 = Uint8Array.from([0xff, 0xfe, 0x6d, 0x00, 0x65, 0x00, 0x72, 0x00, 0x68, 0x00, 0x61, 0x00, 0x62, 0x00, 0x61, 0x00]);
    expect(decodeNfcForm([{
      recordType: 'text', encoding: 'utf-16', data: new DataView(utf16.buffer),
    }])).toEqual({type: 'text', fields: {text: 'merhaba'}});
  });

  it('restores vCards with MIME casing and charset parameters', () => {
    const raw = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Lovelace;Ada;;;', 'FN:Ada Lovelace', 'END:VCARD'].join('\r\n');
    expect(decodeNfcForm([{
      recordType: 'mime', mediaType: 'Text/VCard; Charset=UTF-8',
      data: new DataView(new TextEncoder().encode(raw).buffer),
    }])).toEqual({type: 'vcard', fields: {firstName: 'Ada', lastName: 'Lovelace'}});

    const latin1Raw = ['BEGIN:VCARD', 'VERSION:3.0', 'N:;Ürer;;;', 'FN:Ürer', 'END:VCARD'].join('\r\n');
    const latin1 = Uint8Array.from([...latin1Raw].map(character => character.charCodeAt(0)));
    expect(decodeNfcForm([{
      recordType: 'mime', mediaType: 'text/vcard; charset=iso-8859-1',
      data: new DataView(latin1.buffer),
    }])).toEqual({type: 'vcard', fields: {firstName: 'Ürer'}});
  });

  it('restores direct and linked social scans into the editable form', () => {
    const record = (url: string) => ({
      recordType: 'url',
      data: new DataView(new TextEncoder().encode(url).buffer),
    });

    expect(decodeNfcForm([record('https://www.instagram.com/renderhane/')])).toEqual({
      type: 'social',
      fields: {socialMode: 'single', platform: 'instagram', socialValue: 'https://www.instagram.com/renderhane/'},
    });
    expect(decodeNfcForm([record('https://m.youtube.com/watch?v=abc123')])).toEqual({
      type: 'social',
      fields: {socialMode: 'single', platform: 'youtube', socialValue: 'https://m.youtube.com/watch?v=abc123'},
    });
    expect(decodeNfcForm([record('https://renderhane.com/tr/s?n=Renderhane&i=%40renderhane')])).toEqual({
      type: 'social',
      fields: {socialMode: 'card', profileName: 'Renderhane', instagram: '@renderhane'},
    });
    expect(decodeNfcForm([record('https://renderhane.com/tr/k?n=Turgut&s=%C3%9Crer&p=%2B905551234567&e=turgut%40example.com')])).toEqual({
      type: 'vcard',
      fields: {
        contactMode: 'linked', firstName: 'Turgut', lastName: 'Ürer',
        phone: '+905551234567', email: 'turgut@example.com',
      },
    });
  });

  it('turns Android Web NFC IO failures into actionable Turkish messages', () => {
    const error = new DOMException('Failed to write due to an IO error: null', 'NetworkError');
    expect(nfcWriteErrorMessage(error, false)).toContain('mevcut içerik');
    expect(nfcWriteErrorMessage(error, false)).not.toContain('null');
    expect(nfcWriteErrorMessage(error, true)).toContain('Kapasiteyi kontrol et');
    expect(nfcReadErrorMessage(new DOMException('Cannot decode record', 'DataError'))).toContain('okunamadı');
    expect(nfcReadErrorMessage(new DOMException('Cannot decode record', 'DataError'))).not.toContain('yazılamadı');
  });

  it('covers every NFC Forum tag type and keeps proprietary cards out of generic web writes', () => {
    for (const type of [1, 2, 3, 4, 5] as const) {
      const profiles = profilesForForumType(type);
      expect(profiles.length).toBeGreaterThan(0);
      expect(profiles.some(supportsGenericWebNdef)).toBe(true);
    }

    const proprietary = profilesForForumType('proprietary');
    expect(proprietary.length).toBeGreaterThan(0);
    expect(proprietary.every(profile => !supportsGenericWebNdef(profile))).toBe(true);
    expect(NFC_CHIP_PROFILES.some(profile => profile.id === 'mifare-classic')).toBe(true);
  });

  it('advertises Web NFC only for NDEF-compatible profiles', () => {
    const webProfiles = profilesForTransport('web-nfc');
    expect(webProfiles).toHaveLength(5);
    expect(webProfiles.map(profile => profile.forumType)).toEqual([1, 2, 3, 4, 5]);
    expect(webProfiles.every(profile => profile.technologies.includes('ndef'))).toBe(true);
  });

  it('reports browser and secure-context requirements before opening a session', () => {
    const insecure = createWebNfcAdapter({isSecureContext: false} as WebNfcWindow);
    expect(insecure.support()).toMatchObject({available: false, transport: 'web-nfc'});
    expect(insecure.support().reason).toMatch(/HTTPS/);

    const missing = createWebNfcAdapter({isSecureContext: true} as WebNfcWindow);
    expect(missing.support()).toMatchObject({available: false, canWriteNdef: false});
    expect(missing.support().reason).toMatch(/Web NFC/);
  });

  it('writes and reads through the Web NFC adapter boundary', async () => {
    class FakeReader {
      static last: FakeReader | undefined;
      static lock = vi.fn(async (options: {signal: AbortSignal}) => { void options; });
      onreading: ((event: never) => void) | null = null;
      onreadingerror: (() => void) | null = null;
      write = vi.fn(async () => undefined);
      async makeReadOnly(options: {signal: AbortSignal}): Promise<void> { await FakeReader.lock(options); }
      scanSignal: AbortSignal | undefined;
      constructor() { FakeReader.last = this; }
      async scan(options: {signal: AbortSignal}): Promise<void> {
        this.scanSignal = options.signal;
        const record = Object.create({
          recordType: 'text',
          encoding: 'utf-8',
          data: new DataView(new TextEncoder().encode('merhaba').buffer),
        });
        queueMicrotask(() => this.onreading?.({
          serialNumber: 'test-tag',
          message: {records: [record]},
        } as never));
      }
    }

    const win = {isSecureContext: true, NDEFReader: FakeReader} as unknown as WebNfcWindow;
    const adapter = createWebNfcAdapter(win);
    expect(adapter.support()).toMatchObject({available: true, canReadNdef: true, canLock: true, canTransceive: false});

    const writeController = new AbortController();
    await adapter.write([{recordType: 'url', data: 'https://renderhane.com'}], {signal: writeController.signal, overwrite: false});
    expect(FakeReader.last?.write).toHaveBeenCalledWith(
      {records: [{recordType: 'url', data: 'https://renderhane.com'}]},
      {signal: writeController.signal, overwrite: false},
    );

    const lockController = new AbortController();
    await adapter.makeReadOnly?.({technologies: ['ndef']}, lockController.signal);
    expect(FakeReader.lock).toHaveBeenCalledWith({signal: lockController.signal});

    const scan = await adapter.scan({signal: new AbortController().signal});
    expect(scan.serialNumber).toBe('test-tag');
    expect(decodeNfcRecord(scan.records[0]!)).toBe('merhaba');
    expect(FakeReader.last?.scanSignal?.aborted).toBe(true);
  });
});
