import {describe, expect, it, vi} from 'vitest';
import {
  NFC_CHIP_PROFILES,
  createWebNfcAdapter,
  decodeNfcRecord,
  profilesForForumType,
  profilesForTransport,
  supportsGenericWebNdef,
  type WebNfcWindow,
} from '../nfc';

describe('NFC chip platform', () => {
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
      onreading: ((event: never) => void) | null = null;
      onreadingerror: (() => void) | null = null;
      write = vi.fn(async () => undefined);
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
    expect(adapter.support()).toMatchObject({available: true, canReadNdef: true, canTransceive: false});

    const writeController = new AbortController();
    await adapter.write([{recordType: 'url', data: 'https://renderhane.com'}], {signal: writeController.signal, overwrite: false});
    expect(FakeReader.last?.write).toHaveBeenCalledWith(
      {records: [{recordType: 'url', data: 'https://renderhane.com'}]},
      {signal: writeController.signal, overwrite: false},
    );

    const scan = await adapter.scan({signal: new AbortController().signal});
    expect(scan.serialNumber).toBe('test-tag');
    expect(decodeNfcRecord(scan.records[0]!)).toBe('merhaba');
    expect(FakeReader.last?.scanSignal?.aborted).toBe(true);
  });
});
