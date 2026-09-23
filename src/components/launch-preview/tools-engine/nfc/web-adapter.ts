import type {
  NfcAdapter,
  NfcAdapterSupport,
  NfcReadRecord,
  NfcRecordInput,
  NfcScanOptions,
  NfcScanResult,
  NfcWriteOptions,
} from './types';

interface WebNfcRecord {
  recordType: string;
  mediaType?: string | null;
  encoding?: string | null;
  lang?: string | null;
  id?: string | null;
  data: DataView | null;
}

interface WebNfcReadingEvent extends Event {
  serialNumber?: string;
  message: {records: WebNfcRecord[]};
}

interface WebNfcReader {
  write(message: {records: readonly NfcRecordInput[]}, options: NfcWriteOptions): Promise<void>;
  makeReadOnly?(options: {signal: AbortSignal}): Promise<void>;
  scan(options: NfcScanOptions): Promise<void>;
  onreading: ((event: WebNfcReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
}

interface WebNfcReaderConstructor {
  new (): WebNfcReader;
  prototype: WebNfcReader;
}

export type WebNfcWindow = Window & {NDEFReader?: WebNfcReaderConstructor};

function unavailableReason(win: WebNfcWindow): string | undefined {
  if (!win.isSecureContext) return 'NFC erişimi HTTPS veya localhost gerektirir.';
  if (!win.NDEFReader) return 'Bu tarayıcı Web NFC NDEF erişimi sunmuyor.';
  return undefined;
}

export function createWebNfcAdapter(win: WebNfcWindow): NfcAdapter {
  return {
    id: 'web-nfc',
    support(): NfcAdapterSupport {
      const reason = unavailableReason(win);
      return {
        available: !reason,
        transport: 'web-nfc',
        canReadNdef: !reason,
        canWriteNdef: !reason,
        canFormatNdef: false,
        canLock: !reason && typeof win.NDEFReader?.prototype.makeReadOnly === 'function',
        canTransceive: false,
        reason,
      };
    },
    async write(records: readonly NfcRecordInput[], options: NfcWriteOptions): Promise<void> {
      if (unavailableReason(win) || !win.NDEFReader) throw new DOMException(unavailableReason(win), 'NotSupportedError');
      const reader = new win.NDEFReader();
      await reader.write({records}, options);
    },
    async makeReadOnly(_tag, signal): Promise<void> {
      if (unavailableReason(win) || !win.NDEFReader) throw new DOMException(unavailableReason(win), 'NotSupportedError');
      if (typeof win.NDEFReader.prototype.makeReadOnly !== 'function')
        throw new DOMException('Bu tarayıcı kalıcı NFC kilitlemeyi desteklemiyor.', 'NotSupportedError');
      const reader = new win.NDEFReader();
      await reader.makeReadOnly!({signal});
    },
    async scan(options: NfcScanOptions): Promise<NfcScanResult> {
      if (unavailableReason(win) || !win.NDEFReader) throw new DOMException(unavailableReason(win), 'NotSupportedError');
      const reader = new win.NDEFReader();
      return await new Promise<NfcScanResult>((resolve, reject) => {
        const session = new AbortController();
        let settled = false;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          options.signal.removeEventListener('abort', abort);
          session.abort();
          callback();
        };
        const abort = () => finish(() => reject(new DOMException('NFC işlemi durduruldu.', 'AbortError')));
        if (options.signal.aborted) { abort(); return; }
        options.signal.addEventListener('abort', abort, {once: true});
        reader.onreading = event => {
          const records: NfcReadRecord[] = event.message.records.map(record => ({
            recordType: record.recordType,
            mediaType: record.mediaType,
            encoding: record.encoding,
            lang: record.lang,
            id: record.id,
            data: record.data,
          }));
          finish(() => resolve({serialNumber: event.serialNumber, records}));
        };
        reader.onreadingerror = () =>
          finish(() => reject(new DOMException('NDEF etiketi okunamadı.', 'DataError')));
        void reader.scan({signal: session.signal}).catch(error =>
          finish(() => reject(error)));
      });
    },
  };
}

export function decodeNfcRecord(record: NfcReadRecord): string {
  if (!record.data) return `[${record.recordType}: boş veri]`;
  try {
    return new TextDecoder(record.encoding || 'utf-8').decode(record.data);
  } catch {
    return `[${record.recordType}: ikili veri]`;
  }
}
