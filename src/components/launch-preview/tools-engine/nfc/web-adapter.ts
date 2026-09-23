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
  scan(options: NfcScanOptions): Promise<void>;
  onreading: ((event: WebNfcReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
}

export type WebNfcWindow = Window & {NDEFReader?: new () => WebNfcReader};

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
        canLock: false,
        canTransceive: false,
        reason,
      };
    },
    async write(records: readonly NfcRecordInput[], options: NfcWriteOptions): Promise<void> {
      if (unavailableReason(win) || !win.NDEFReader) throw new DOMException(unavailableReason(win), 'NotSupportedError');
      const reader = new win.NDEFReader();
      await reader.write({records}, options);
    },
    async scan(options: NfcScanOptions): Promise<NfcScanResult> {
      if (unavailableReason(win) || !win.NDEFReader) throw new DOMException(unavailableReason(win), 'NotSupportedError');
      const reader = new win.NDEFReader();
      return await new Promise<NfcScanResult>((resolve, reject) => {
        const abort = () => reject(new DOMException('NFC işlemi durduruldu.', 'AbortError'));
        options.signal.addEventListener('abort', abort, {once: true});
        reader.onreading = event => {
          options.signal.removeEventListener('abort', abort);
          const records: NfcReadRecord[] = event.message.records.map(record => ({
            recordType: record.recordType,
            mediaType: record.mediaType,
            encoding: record.encoding,
            lang: record.lang,
            id: record.id,
            data: record.data,
          }));
          resolve({serialNumber: event.serialNumber, records});
        };
        reader.onreadingerror = () => {
          options.signal.removeEventListener('abort', abort);
          reject(new DOMException('NDEF etiketi okunamadı.', 'DataError'));
        };
        void reader.scan(options).catch(error => {
          options.signal.removeEventListener('abort', abort);
          reject(error);
        });
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
