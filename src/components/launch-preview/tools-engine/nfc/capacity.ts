import type {NfcRecordInput} from './types';

export type NfcCapacityProfileId = 'unknown' | 'ntag213' | 'ntag215' | 'ntag216';

export interface NfcCapacityProfile {
  id: NfcCapacityProfileId;
  label: string;
  capacityBytes: number | null;
}

export const NFC_CAPACITY_PROFILES: readonly NfcCapacityProfile[] = [
  {id: 'unknown', label: 'Etiket modelini seç', capacityBytes: null},
  {id: 'ntag213', label: 'NTAG213 · 144 bayt', capacityBytes: 144},
  {id: 'ntag215', label: 'NTAG215 · 504 bayt', capacityBytes: 504},
  {id: 'ntag216', label: 'NTAG216 · 888 bayt', capacityBytes: 888},
] as const;

const encoder = new TextEncoder();

function payloadLength(record: NfcRecordInput): number {
  const length = typeof record.data === 'string' ? encoder.encode(record.data).length : record.data.byteLength;
  if (record.recordType === 'url') return length + 1; // URI identifier-code byte; conservative, without prefix compression.
  if (record.recordType === 'text') return length + 1 + encoder.encode(record.lang || 'en').length;
  return length;
}

function typeLength(record: NfcRecordInput): number {
  if (record.recordType === 'url') return 1; // NFC Forum well-known type U.
  if (record.recordType === 'text') return 1; // NFC Forum well-known type T.
  if (record.recordType === 'mime') return encoder.encode(record.mediaType || 'application/octet-stream').length;
  return encoder.encode(record.recordType).length;
}

/**
 * Conservative NFC Forum Type 2 storage estimate. It includes each NDEF record,
 * the NDEF TLV header and the terminator byte. URI prefix compression is not
 * assumed, so a value reported as fitting will not depend on browser-specific
 * compression.
 */
export function estimateNdefStorageBytes(records: readonly NfcRecordInput[]): number {
  const messageBytes = records.reduce((total, record) => {
    const payload = payloadLength(record);
    const id = record.id ? encoder.encode(record.id).length : 0;
    const header = 1 + 1 + (payload <= 0xff ? 1 : 4) + (id ? 1 : 0);
    return total + header + typeLength(record) + id + payload;
  }, 0);
  const tlvHeader = messageBytes <= 0xfe ? 2 : 4;
  return messageBytes + tlvHeader + 1;
}

export function getNfcCapacityProfile(id: NfcCapacityProfileId): NfcCapacityProfile {
  return NFC_CAPACITY_PROFILES.find(profile => profile.id === id) ?? NFC_CAPACITY_PROFILES[0];
}

export interface NfcCapacityCheck {
  estimatedBytes: number;
  capacityBytes: number | null;
  remainingBytes: number | null;
  fits: boolean | null;
}

export function checkNfcCapacity(records: readonly NfcRecordInput[], profileId: NfcCapacityProfileId): NfcCapacityCheck {
  const estimatedBytes = estimateNdefStorageBytes(records);
  const capacityBytes = getNfcCapacityProfile(profileId).capacityBytes;
  if (capacityBytes === null) return {estimatedBytes, capacityBytes, remainingBytes: null, fits: null};
  return {
    estimatedBytes,
    capacityBytes,
    remainingBytes: capacityBytes - estimatedBytes,
    fits: estimatedBytes <= capacityBytes,
  };
}

export function nfcWriteErrorMessage(error: unknown, overwrite: boolean): string {
  const name = error instanceof Error ? error.name : '';
  const detail = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError') return 'NFC izni verilmedi. İzinleri kontrol ederek tekrar dene.';
  if (name === 'NotSupportedError') return 'Cihaz veya etiket bu işlemi desteklemiyor.';
  if (name === 'AbortError') return 'NFC işlemi durduruldu.';
  if (name === 'InvalidStateError') return 'Başka bir NFC işlemi açık olabilir. Sayfayı önde tutup yeniden dene.';
  if (name === 'NotReadableError') return 'NFC etiketi okunamadı. Etiketi telefonun NFC alanında sabit tutup yeniden dene.';
  if (name === 'DataError') return 'İçerik geçerli bir NDEF kaydı olarak yazılamadı. Alanları kısaltıp yeniden dene.';
  if (name === 'NetworkError' || /(?:i[\s./-]*o|input[\s./-]*output).*error|null/i.test(detail)) {
    return overwrite
      ? 'Etikete yazılamadı. Etiket dolu, kilitli/korumalı olabilir veya temas kesilmiş olabilir. Kapasiteyi kontrol et ve etiketi telefonun NFC alanında sabit tut.'
      : 'Etikete yazılamadı. Etiket dolu, kilitli/korumalı olabilir veya mevcut içerik üzerine yazmayı engelliyor olabilir. Önce etiketi oku; mevcut içerik varsa “üzerine yaz” seçeneğini aç.';
  }
  return detail ? `NFC işlemi tamamlanmadı: ${detail}` : 'NFC işlemi tamamlanmadı. Etiketi ve telefonun NFC ayarını kontrol et.';
}

export function nfcReadErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const detail = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError') return 'NFC izni verilmedi. İzinleri kontrol ederek tekrar dene.';
  if (name === 'NotSupportedError') return 'Cihaz veya etiket NDEF okumayı desteklemiyor.';
  if (name === 'AbortError') return 'NFC okuma işlemi durduruldu.';
  if (name === 'InvalidStateError') return 'Başka bir NFC işlemi açık olabilir. Sayfayı önde tutup yeniden dene.';
  if (name === 'NotReadableError' || name === 'DataError') return 'NFC etiketi okunamadı. Etiketi telefonun NFC alanında sabit tutup yeniden dene.';
  if (name === 'NetworkError' || /(?:i[\s./-]*o|input[\s./-]*output).*error|null/i.test(detail)) {
    return 'NFC etiketi okunamadı. Temas kesilmiş veya etiket uyumsuz olabilir; etiketi telefonun NFC alanında sabit tutup yeniden dene.';
  }
  return detail ? `NFC etiketi okunamadı: ${detail}` : 'NFC etiketi okunamadı. Etiketi ve telefonun NFC ayarını kontrol et.';
}
