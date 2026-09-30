import type {NfcRecordInput} from './types';
import {NFC_TAG_CAPACITIES, URI_PREFIXES, uriPrefixCode} from '@/lib/nfc/ndef';

export type NfcCapacityProfileId = 'unknown' | 'ntag213' | 'ntag215' | 'ntag216';

export interface NfcCapacityProfile {
  id: NfcCapacityProfileId;
  label: string;
  capacityBytes: number | null;
}

function canonicalCapacity(id: 'NTAG213' | 'NTAG215' | 'NTAG216'): number {
  return NFC_TAG_CAPACITIES.find(profile => profile.id === id)!.capacity;
}

export const NFC_CAPACITY_PROFILES: readonly NfcCapacityProfile[] = [
  {id: 'unknown', label: 'Etiket modelini seç', capacityBytes: null},
  {id: 'ntag213', label: `NTAG213 · ${canonicalCapacity('NTAG213')} bayt`, capacityBytes: canonicalCapacity('NTAG213')},
  {id: 'ntag215', label: `NTAG215 · ${canonicalCapacity('NTAG215')} bayt`, capacityBytes: canonicalCapacity('NTAG215')},
  {id: 'ntag216', label: `NTAG216 · ${canonicalCapacity('NTAG216')} bayt`, capacityBytes: canonicalCapacity('NTAG216')},
] as const;

const encoder = new TextEncoder();

function payloadLength(record: NfcRecordInput): number {
  const length = typeof record.data === 'string' ? encoder.encode(record.data).length : record.data.byteLength;
  if (record.recordType === 'url') {
    // Android's writer stores the longest RTD-URI prefix (e.g. "https://www.") as one identifier byte.
    const uri = typeof record.data === 'string' ? record.data : '';
    return length + 1 - encoder.encode(URI_PREFIXES[uriPrefixCode(uri)]).length;
  }
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
 * NDEF message size (record headers included). Tag capacities already use their
 * NDEF-message allowance, so Type 2 TLV bytes are not added a second time. URL
 * records count the RTD-URI prefix as the single byte Android writes.
 */
export function estimateNdefStorageBytes(records: readonly NfcRecordInput[]): number {
  return records.reduce((total, record) => {
    const payload = payloadLength(record);
    const id = record.id ? encoder.encode(record.id).length : 0;
    const header = 1 + 1 + (payload <= 0xff ? 1 : 4) + (id ? 1 : 0);
    return total + header + typeLength(record) + id + payload;
  }, 0);
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
  if (name === 'NotAllowedError') {
    // Web NFC also rejects with NotAllowedError when overwrite is off and the
    // tag already holds an NDEF message; only a permission-worded rejection is a denial.
    if (/overwrite/i.test(detail) || (!overwrite && !/permission/i.test(detail)))
      return 'Etikette zaten içerik var ve üzerine yazma kapalı. “Etiketteki mevcut içeriğin üzerine yazılmasına izin ver.” seçeneğini açıp yeniden dene.';
    return 'NFC izni verilmedi. İzinleri kontrol ederek tekrar dene.';
  }
  if (name === 'NotSupportedError') return 'Cihaz veya etiket bu işlemi desteklemiyor.';
  if (name === 'AbortError') return 'NFC işlemi durduruldu.';
  if (name === 'InvalidStateError') return 'Başka bir NFC işlemi açık olabilir. Sayfayı önde tutup yeniden dene.';
  if (name === 'NotReadableError') return 'NFC etiketi okunamadı. Etiketi telefonun NFC alanında sabit tutup yeniden dene.';
  if (name === 'DataError') return 'İçerik geçerli bir NDEF kaydı olarak yazılamadı. Alanları kısaltıp yeniden dene.';
  if (name === 'NetworkError' || /(?:\bi[\s./-]*o|input[\s./-]*output)\b.*error|^\s*null\s*$/i.test(detail)) {
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
  if (name === 'NetworkError' || /(?:\bi[\s./-]*o|input[\s./-]*output)\b.*error|^\s*null\s*$/i.test(detail)) {
    return 'NFC etiketi okunamadı. Temas kesilmiş veya etiket uyumsuz olabilir; etiketi telefonun NFC alanında sabit tutup yeniden dene.';
  }
  return detail ? `NFC etiketi okunamadı: ${detail}` : 'NFC etiketi okunamadı. Etiketi ve telefonun NFC ayarını kontrol et.';
}
