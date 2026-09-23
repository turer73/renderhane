import type {NfcChipProfile, NfcForumTagType, NfcTransport} from './types';

const WEB: readonly NfcTransport[] = ['web-nfc', 'android-native', 'ios-core-nfc', 'pcsc-usb'];
const NATIVE: readonly NfcTransport[] = ['android-native', 'ios-core-nfc', 'pcsc-usb'];

/**
 * Standards-first coverage catalog. Product names are examples, not a finite
 * allow-list: unknown chips inherit the matching NFC Forum type profile.
 */
export const NFC_CHIP_PROFILES: readonly NfcChipProfile[] = [
  {
    id: 'forum-type-1', label: 'NFC Forum Type 1', vendors: ['Broadcom / Innovision'],
    families: ['Topaz', 'Jewel'], forumType: 1, technologies: ['nfc-a', 'ndef'],
    transports: WEB, ndef: 'required', security: ['none'],
    notes: 'Legacy, low-capacity NDEF tags. Support is provided through the standards fallback.',
  },
  {
    id: 'forum-type-2', label: 'NFC Forum Type 2', vendors: ['NXP', 'STMicroelectronics'],
    families: ['NTAG 21x', 'NTAG I2C', 'MIFARE Ultralight', 'ST25TN'], forumType: 2,
    technologies: ['nfc-a', 'ndef'], transports: WEB, ndef: 'required',
    security: ['none', 'password'], notes: 'Common stickers and cards; advanced password features need a native or USB driver.',
  },
  {
    id: 'forum-type-3', label: 'NFC Forum Type 3 / FeliCa', vendors: ['Sony'],
    families: ['FeliCa Lite-S', 'FeliCa Standard'], forumType: 3,
    technologies: ['nfc-f', 'ndef'], transports: WEB, ndef: 'required',
    security: ['none', 'symmetric-keys'], notes: 'Generic NDEF works where the device exposes it; services and blocks require native commands.',
  },
  {
    id: 'forum-type-4', label: 'NFC Forum Type 4 / ISO-DEP', vendors: ['NXP', 'STMicroelectronics', 'Infineon'],
    families: ['MIFARE DESFire EV1/EV2/EV3', 'NTAG 424 DNA', 'ST25TA', 'ISO 7816 smart tags'], forumType: 4,
    technologies: ['nfc-a', 'nfc-b', 'iso-dep', 'ndef'], transports: WEB, ndef: 'supported',
    security: ['none', 'symmetric-keys', 'pki'], notes: 'Web access is limited to exposed NDEF. Applications, authentication and secure messaging require a dedicated driver.',
  },
  {
    id: 'forum-type-5', label: 'NFC Forum Type 5 / ISO 15693', vendors: ['NXP', 'STMicroelectronics', 'Texas Instruments', 'EM Microelectronic'],
    families: ['ICODE SLIX/SLIX2/DNA', 'ST25TV', 'ST25DV', 'RF430', 'EM4x'], forumType: 5,
    technologies: ['nfc-v', 'ndef'], transports: WEB, ndef: 'required',
    security: ['none', 'password', 'symmetric-keys'], notes: 'NDEF is portable; long-range, mailbox, tamper and memory-area features require native or reader-specific drivers.',
  },
  {
    id: 'mifare-classic', label: 'MIFARE Classic / Mini', vendors: ['NXP and compatible vendors'],
    families: ['MIFARE Classic 1K', 'MIFARE Classic 4K', 'MIFARE Mini'], forumType: 'legacy',
    technologies: ['nfc-a', 'mifare-classic'], transports: ['android-native', 'pcsc-usb'], ndef: 'optional',
    security: ['symmetric-keys', 'vendor-specific'], notes: 'Not an NFC Forum tag type. Device support is optional and sector keys are required for protected data.',
  },
  {
    id: 'secure-proprietary', label: 'Secure and proprietary NFC applications', vendors: ['Multiple vendors'],
    families: ['Payment', 'Transit', 'Access control', 'Government identity'], forumType: 'proprietary',
    technologies: ['nfc-a', 'nfc-b', 'nfc-f', 'iso-dep'], transports: NATIVE, ndef: 'not-standard',
    security: ['symmetric-keys', 'pki', 'vendor-specific'], notes: 'Only authorized application protocols and keys are supported. The platform does not bypass access controls or clone credentials.',
  },
];

export function profilesForForumType(type: NfcForumTagType): readonly NfcChipProfile[] {
  return NFC_CHIP_PROFILES.filter(profile => profile.forumType === type);
}

export function profilesForTransport(transport: NfcTransport): readonly NfcChipProfile[] {
  return NFC_CHIP_PROFILES.filter(profile => profile.transports.includes(transport));
}

export function supportsGenericWebNdef(profile: NfcChipProfile): boolean {
  return profile.transports.includes('web-nfc') && profile.ndef !== 'not-standard';
}
