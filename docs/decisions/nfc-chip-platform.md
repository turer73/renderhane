# NFC chip platform

## Decision

Renderhane uses a standards-first NFC core instead of hard-coding individual
chip product numbers into the public tool. NFC Forum Type 1, 2, 3, 4 and 5 are
the portable coverage boundary. Manufacturer-specific functions are delivered
by transport adapters and chip drivers.

"All NFC chips" means that an unknown chip can fall back to its NFC Forum tag
type and NDEF capabilities. It does not mean bypassing authentication or
supporting every proprietary command without an authorized driver and keys.

## Layers

1. Content codecs build NDEF records such as URL, text and vCard.
2. `NfcAdapter` isolates Web NFC, Android, iOS and USB/PC-SC transports.
3. The chip catalog maps standards and common product families to capabilities.
4. Native or USB drivers implement formatting, locking, raw commands and secure
   messaging only where the device, SDK and authorization allow them.
5. The UI negotiates capabilities; it must not promise an operation merely
   because a browser API exists.

## Coverage matrix

| Family | Generic NDEF in Web NFC | Native or USB driver |
| --- | --- | --- |
| Type 1 / Topaz / Jewel | Yes, when exposed by device | Optional |
| Type 2 / NTAG 21x / Ultralight / ST25TN | Yes | Password, counters and special configuration |
| Type 3 / FeliCa | Yes, for NDEF | Services, blocks and authentication |
| Type 4 / DESFire / NTAG 424 / ST25TA | Yes, for an exposed NDEF application | Applications, APDUs and secure messaging |
| Type 5 / ICODE / ST25TV / ST25DV | Yes | Memory areas, mailbox, tamper and long-range features |
| MIFARE Classic / Mini | No portable Web NFC guarantee | Android/reader dependent; authorized sector keys required |
| Payment, transit, access and identity cards | No generic support | Only documented, authorized application protocols |

## Safety requirements

- Never treat a UID as proof of authenticity.
- Never send secure-chip keys to the public browser.
- Check payload size before a native write when capacity is available.
- Read back and compare the stored NDEF message after writing.
- Formatting and permanent locking require separate, explicit confirmation.
- Do not implement credential cloning or access-control bypasses.
- Tests and a profile entry are required for every new driver family.

## Delivery stages

1. Web NDEF adapter and Type 1–5 catalog.
2. Write-then-read verification and capacity-aware native contracts.
3. Android adapter for NFC-A/B/F/V, ISO-DEP and optional MIFARE support.
4. iOS Core NFC adapter for NDEF, ISO7816, ISO15693, FeliCa and MIFARE.
5. USB/PC-SC adapter for controlled production and batch operations.
6. Individual secure-chip drivers backed by server-side key management.
