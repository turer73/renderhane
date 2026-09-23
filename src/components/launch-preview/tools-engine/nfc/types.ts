export type NfcTransport = 'web-nfc' | 'android-native' | 'ios-core-nfc' | 'pcsc-usb';

export type NfcTechnology =
  | 'nfc-a'
  | 'nfc-b'
  | 'nfc-f'
  | 'nfc-v'
  | 'iso-dep'
  | 'ndef'
  | 'mifare-classic';

export type NfcForumTagType = 1 | 2 | 3 | 4 | 5 | 'legacy' | 'proprietary';

export type NfcSecurity = 'none' | 'password' | 'symmetric-keys' | 'pki' | 'vendor-specific';

export interface NfcChipProfile {
  id: string;
  label: string;
  vendors: readonly string[];
  families: readonly string[];
  forumType: NfcForumTagType;
  technologies: readonly NfcTechnology[];
  transports: readonly NfcTransport[];
  ndef: 'required' | 'supported' | 'optional' | 'not-standard';
  security: readonly NfcSecurity[];
  notes: string;
}

export interface NfcRecordInput {
  recordType: string;
  mediaType?: string;
  lang?: string;
  id?: string;
  data: string | Uint8Array;
}

export interface NfcReadRecord {
  recordType: string;
  mediaType?: string | null;
  encoding?: string | null;
  lang?: string | null;
  id?: string | null;
  data: DataView | null;
}

export interface NfcScanResult {
  serialNumber?: string;
  tag?: NfcTagIdentity;
  records: NfcReadRecord[];
}

export interface NfcTagIdentity {
  forumType?: NfcForumTagType;
  technologies: readonly NfcTechnology[];
  manufacturer?: string;
  product?: string;
  capacityBytes?: number;
  writable?: boolean;
  ndefFormatted?: boolean;
}

export interface NfcAdapterSupport {
  available: boolean;
  transport: NfcTransport;
  canReadNdef: boolean;
  canWriteNdef: boolean;
  canFormatNdef: boolean;
  canLock: boolean;
  canTransceive: boolean;
  reason?: string;
}

export interface NfcWriteOptions {
  signal: AbortSignal;
  overwrite: boolean;
}

export interface NfcScanOptions {
  signal: AbortSignal;
}

/**
 * Host boundary for browser, native mobile and USB/PC-SC implementations.
 * Secure-chip keys must stay in the native/secure backend implementation and
 * must never be passed through the public browser adapter.
 */
export interface NfcAdapter {
  readonly id: string;
  support(): NfcAdapterSupport;
  write(records: readonly NfcRecordInput[], options: NfcWriteOptions): Promise<void>;
  scan(options: NfcScanOptions): Promise<NfcScanResult>;
  /** Native/USB transports may expose these operations when authorized. */
  formatNdef?(tag: NfcTagIdentity, signal: AbortSignal): Promise<void>;
  makeReadOnly?(tag: NfcTagIdentity, signal: AbortSignal): Promise<void>;
  transceive?(tag: NfcTagIdentity, command: Uint8Array, signal: AbortSignal): Promise<Uint8Array>;
}
