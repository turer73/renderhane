import type {NfcReadRecord, NfcRecordInput} from './types';

export const RENDERHANE_COMPACT_RECORD_TYPE = 'renderhane.com:c';

export type CompactNfcKind = 'bank' | 'invoice';
export type CompactNfcLocale = 'tr' | 'en';

export interface CompactNfcDetails {
  kind: CompactNfcKind;
  locale: CompactNfcLocale;
  /** Fixed schema order; optional fields are represented by an empty string. */
  fields: readonly string[];
}

const VERSION = 1;
const FIELD_COUNTS: Record<CompactNfcKind, number> = {bank: 5, invoice: 5};
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  do {
    const next = value & 0x7f;
    value >>>= 7;
    bytes.push(value ? next | 0x80 : next);
  } while (value);
  return bytes;
}

function readVarint(bytes: Uint8Array, offset: number): {value: number; offset: number} {
  let value = 0;
  let shift = 0;
  while (offset < bytes.length && shift <= 28) {
    const byte = bytes[offset++]!;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return {value, offset};
    shift += 7;
  }
  throw new Error('Geçersiz Renderhane sıkıştırılmış NFC kaydı.');
}

export function encodeCompactNfcDetails(details: CompactNfcDetails): Uint8Array {
  const expected = FIELD_COUNTS[details.kind];
  if (details.fields.length !== expected) throw new Error('Sıkıştırılmış NFC alan şeması geçersiz.');
  const kind = details.kind === 'bank' ? 1 : 2;
  const flags = kind | (details.locale === 'en' ? 0x80 : 0);
  const output: number[] = [VERSION, flags];
  for (const field of details.fields) {
    const value = encoder.encode(field);
    output.push(...encodeVarint(value.length), ...value);
  }
  return Uint8Array.from(output);
}

export function createCompactNfcRecord(details: CompactNfcDetails): NfcRecordInput {
  return {
    recordType: RENDERHANE_COMPACT_RECORD_TYPE,
    data: encodeCompactNfcDetails(details),
  };
}

export function decodeCompactNfcRecord(record: NfcReadRecord): CompactNfcDetails | null {
  if (record.recordType !== RENDERHANE_COMPACT_RECORD_TYPE) return null;
  if (!record.data) throw new Error('Renderhane sıkıştırılmış NFC kaydı boş.');
  const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
  if (bytes.length < 2 || bytes[0] !== VERSION) throw new Error('Renderhane sıkıştırılmış NFC sürümü desteklenmiyor.');
  const kindBits = bytes[1]! & 0x7f;
  const kind: CompactNfcKind = kindBits === 1 ? 'bank' : kindBits === 2 ? 'invoice' : (() => { throw new Error('Renderhane sıkıştırılmış NFC türü geçersiz.'); })();
  const locale: CompactNfcLocale = (bytes[1]! & 0x80) !== 0 ? 'en' : 'tr';
  const fields: string[] = [];
  let offset = 2;
  for (let index = 0; index < FIELD_COUNTS[kind]; index++) {
    const length = readVarint(bytes, offset);
    offset = length.offset;
    if (length.value > bytes.length - offset) throw new Error('Renderhane sıkıştırılmış NFC kaydı eksik.');
    fields.push(decoder.decode(bytes.subarray(offset, offset + length.value)));
    offset += length.value;
  }
  if (offset !== bytes.length) throw new Error('Renderhane sıkıştırılmış NFC kaydında beklenmeyen veri var.');
  return {kind, locale, fields};
}

export function formatCompactNfcDetails(details: CompactNfcDetails): string {
  const en = details.locale === 'en';
  if (details.kind === 'bank') {
    const [accountName, iban, bankName, branch, description] = details.fields;
    return [
      en ? 'BANK DETAILS' : 'BANKA BİLGİLERİ',
      `${en ? 'Recipient' : 'Alıcı'}: ${accountName}`,
      `IBAN: ${iban}`,
      bankName ? `${en ? 'Bank' : 'Banka'}: ${bankName}` : '',
      branch ? `${en ? 'Branch' : 'Şube'}: ${branch}` : '',
      description ? `${en ? 'Reference' : 'Açıklama'}: ${description}` : '',
    ].filter(Boolean).join('\n');
  }
  const [title, taxOffice, taxNumber, address, invoiceEmail] = details.fields;
  return [
    en ? 'INVOICE DETAILS' : 'FATURA BİLGİLERİ',
    `${en ? 'Legal name' : 'Unvan'}: ${title}`,
    taxOffice ? `${en ? 'Tax office' : 'Vergi dairesi'}: ${taxOffice}` : '',
    `${en ? 'Tax/ID no' : 'Vergi/T.C. no'}: ${taxNumber}`,
    `${en ? 'Address' : 'Adres'}: ${address}`,
    invoiceEmail ? `${en ? 'Email' : 'E-posta'}: ${invoiceEmail}` : '',
  ].filter(Boolean).join('\n');
}
