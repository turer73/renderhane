/**
 * Minimal Web NFC typings (https://w3c.github.io/web-nfc/).
 *
 * Not part of lib.dom.d.ts — the API ships only in Chromium on Android, so
 * TypeScript needs the shape declared here. Covers the subset the free NFC
 * writer at /araclar/nfc-yaz uses.
 */

interface NDEFRecordInit {
  recordType: string;
  mediaType?: string;
  id?: string;
  encoding?: string;
  lang?: string;
  // The IDL types this as `any`; kept wide so plain Uint8Array payloads pass.
  data?: string | ArrayBuffer | ArrayBufferView | NDEFMessageInit;
}

interface NDEFMessageInit {
  records: NDEFRecordInit[];
}

declare class NDEFRecord {
  constructor(init: NDEFRecordInit);
  readonly recordType: string;
  readonly mediaType: string | null;
  readonly id: string | null;
  readonly encoding: string | null;
  readonly lang: string | null;
  readonly data: DataView | null;
  toRecords(): NDEFRecord[];
}

declare class NDEFMessage {
  constructor(init: NDEFMessageInit);
  readonly records: readonly NDEFRecord[];
}

interface NDEFReadingEvent extends Event {
  readonly serialNumber: string;
  readonly message: NDEFMessage;
}

interface NDEFWriteOptions {
  overwrite?: boolean;
  signal?: AbortSignal;
}

interface NDEFMakeReadOnlyOptions {
  signal?: AbortSignal;
}

interface NDEFScanOptions {
  signal?: AbortSignal;
}

declare class NDEFReader extends EventTarget {
  constructor();
  onreading: ((this: NDEFReader, event: NDEFReadingEvent) => void) | null;
  onreadingerror: ((this: NDEFReader, event: Event) => void) | null;
  scan(options?: NDEFScanOptions): Promise<void>;
  write(
    message: string | BufferSource | NDEFMessageInit,
    options?: NDEFWriteOptions
  ): Promise<void>;
  makeReadOnly(options?: NDEFMakeReadOnlyOptions): Promise<void>;
}
