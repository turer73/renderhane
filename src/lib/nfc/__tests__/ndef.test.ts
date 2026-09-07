import { describe, it, expect } from "vitest";
import {
  AAR_TYPE,
  VCARD_MIME,
  WSC_MIME,
  buildNdefRecords,
  buildWifiWscPayload,
  describeRecord,
  isNfcInputValid,
  ndefMessageBytes,
  normalizeUrl,
  readWscSsid,
  recordsToForm,
  tagFit,
  uriPrefixCode,
} from "../ndef";

const decode = (data: string | Uint8Array) =>
  typeof data === "string" ? data : new TextDecoder().decode(data);

describe("uriPrefixCode", () => {
  it("picks the longest matching RTD-URI prefix", () => {
    expect(uriPrefixCode("https://www.renderhane.com")).toBe(2);
    expect(uriPrefixCode("https://renderhane.com")).toBe(4);
    expect(uriPrefixCode("http://www.a.com")).toBe(1);
    expect(uriPrefixCode("tel:+905551234567")).toBe(5);
    expect(uriPrefixCode("mailto:info@renderhane.com")).toBe(6);
  });

  it("falls back to no abbreviation for unlisted schemes", () => {
    expect(uriPrefixCode("sms:+905551234567")).toBe(0);
    expect(uriPrefixCode("plain text")).toBe(0);
  });
});

describe("normalizeUrl", () => {
  it("adds https:// to bare domains but keeps existing schemes", () => {
    expect(normalizeUrl("renderhane.com")).toBe("https://renderhane.com");
    expect(normalizeUrl("  www.renderhane.com ")).toBe("https://www.renderhane.com");
    expect(normalizeUrl("http://renderhane.com")).toBe("http://renderhane.com");
    expect(normalizeUrl("tel:+905551234567")).toBe("tel:+905551234567");
    expect(normalizeUrl("")).toBe("");
  });
});

describe("isNfcInputValid", () => {
  it("requires the fields each content type cannot be written without", () => {
    expect(isNfcInputValid("url", {})).toBe(false);
    expect(isNfcInputValid("url", { url: "renderhane.com" })).toBe(true);
    expect(isNfcInputValid("wifi", { password: "x" })).toBe(false);
    expect(isNfcInputValid("wifi", { ssid: "MyWiFi" })).toBe(true);
    expect(isNfcInputValid("location", { lat: "41.0" })).toBe(false);
    expect(isNfcInputValid("location", { lat: "41.0", lon: "28.9" })).toBe(true);
    expect(isNfcInputValid("vcard", { firstName: "   " })).toBe(false);
  });
});

describe("buildNdefRecords", () => {
  it("returns nothing while required fields are empty", () => {
    expect(buildNdefRecords("url", {})).toEqual([]);
  });

  it("writes URLs as a single RTD-URI record, normalized", () => {
    const records = buildNdefRecords("url", { url: "renderhane.com" });
    expect(records).toHaveLength(1);
    expect(records[0].recordType).toBe("url");
    expect(records[0].data).toBe("https://renderhane.com");
  });

  it("builds tel/mailto/sms/maps URIs", () => {
    expect(buildNdefRecords("phone", { phone: "+90 555 123 45 67" })[0].data).toBe(
      "tel:+905551234567"
    );
    expect(buildNdefRecords("email", { email: "a@b.com", subject: "Merhaba Dünya" })[0].data).toBe(
      "mailto:a@b.com?subject=Merhaba%20D%C3%BCnya"
    );
    expect(buildNdefRecords("sms", { phone: "+905551234567", body: "selam" })[0].data).toBe(
      "sms:+905551234567?body=selam"
    );
    expect(buildNdefRecords("location", { lat: "41.0082", lon: "28.9784" })[0].data).toBe(
      "https://www.google.com/maps?q=41.0082,28.9784"
    );
  });

  it("writes text records with a language tag", () => {
    const [record] = buildNdefRecords("text", { text: "merhaba" }, { lang: "en" });
    expect(record).toMatchObject({ recordType: "text", lang: "en", data: "merhaba" });
  });

  it("writes contact cards as a text/vcard MIME record", () => {
    const [record] = buildNdefRecords("vcard", {
      firstName: "Ahmet",
      lastName: "Yilmaz",
      phone: "+905551234567",
    });
    expect(record.recordType).toBe("mime");
    expect(record.mediaType).toBe(VCARD_MIME);
    const vcard = decode(record.data);
    expect(vcard).toContain("BEGIN:VCARD");
    expect(vcard).toContain("FN:Ahmet Yilmaz");
    expect(vcard).toContain("TEL;TYPE=CELL:+905551234567");
  });

  it("pairs an Android app record with a Play Store fallback URL", () => {
    const records = buildNdefRecords("app", { packageName: "com.renderhane.app" });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      recordType: "url",
      data: "https://play.google.com/store/apps/details?id=com.renderhane.app",
    });
    expect(records[1].recordType).toBe(AAR_TYPE);
    expect(decode(records[1].data)).toBe("com.renderhane.app");
  });
});

describe("buildWifiWscPayload", () => {
  it("wraps the credential TLV Android looks for", () => {
    const payload = buildWifiWscPayload({ ssid: "MyWiFi", password: "sifre123" });
    // Outer TLV: type 0x100E, then a 2-byte length covering the rest.
    expect(payload[0]).toBe(0x10);
    expect(payload[1]).toBe(0x0e);
    expect((payload[2] << 8) | payload[3]).toBe(payload.length - 4);
    expect(readWscSsid(payload)).toBe("MyWiFi");
    expect(decode(payload)).toContain("sifre123");
  });

  it("encodes WPA, WEP and open networks with distinct auth types", () => {
    // Scan the credential's nested TLVs for the auth type field (0x1003).
    const authOf = (p: Uint8Array) => {
      for (let j = 4; j + 4 <= p.length; ) {
        const type = (p[j] << 8) | p[j + 1];
        const len = (p[j + 2] << 8) | p[j + 3];
        if (type === 0x1003) return (p[j + 4] << 8) | p[j + 5];
        j += 4 + len;
      }
      return -1;
    };
    expect(authOf(buildWifiWscPayload({ ssid: "a", password: "b" }))).toBe(0x0022);
    expect(authOf(buildWifiWscPayload({ ssid: "a", password: "b", encryption: "WEP" }))).toBe(
      0x0001
    );
    expect(authOf(buildWifiWscPayload({ ssid: "a", encryption: "nopass" }))).toBe(0x0001);
  });

  it("drops the password on open networks", () => {
    const open = buildWifiWscPayload({ ssid: "Cafe", password: "leak", encryption: "nopass" });
    expect(decode(open)).not.toContain("leak");
  });

  it("is reachable through buildNdefRecords as a WSC MIME record", () => {
    const [record] = buildNdefRecords("wifi", { ssid: "MyWiFi", password: "sifre123" });
    expect(record.mediaType).toBe(WSC_MIME);
    expect(readWscSsid(record.data as Uint8Array)).toBe("MyWiFi");
  });
});

describe("ndefMessageBytes", () => {
  it("counts record headers and the abbreviated URI prefix", () => {
    // header + type len + payload len + "U" + (prefix byte + "renderhane.com")
    const bytes = ndefMessageBytes(buildNdefRecords("url", { url: "https://www.renderhane.com" }));
    expect(bytes).toBe(1 + 1 + 1 + 1 + 1 + "renderhane.com".length);
  });

  it("grows the length field past the 255-byte short-record limit", () => {
    const short = ndefMessageBytes([{ recordType: "text", lang: "tr", data: "a".repeat(200) }]);
    const long = ndefMessageBytes([{ recordType: "text", lang: "tr", data: "a".repeat(300) }]);
    expect(short).toBe(1 + 1 + 1 + 1 + (1 + 2 + 200));
    expect(long).toBe(1 + 1 + 4 + 1 + (1 + 2 + 300));
  });

  it("counts UTF-8 bytes, not characters", () => {
    const ascii = ndefMessageBytes([{ recordType: "text", lang: "tr", data: "gunes" }]);
    const turkish = ndefMessageBytes([{ recordType: "text", lang: "tr", data: "güneş" }]);
    expect(turkish).toBe(ascii + 2);
  });
});

describe("tagFit", () => {
  it("marks which stock tags the message still fits on", () => {
    const fit = Object.fromEntries(tagFit(200).map((t) => [t.id, t.fits]));
    expect(fit).toMatchObject({ Ultralight: false, NTAG213: false, NTAG215: true, NTAG216: true });
  });

  it("treats an empty message as fitting nothing", () => {
    expect(tagFit(0).every((t) => !t.fits)).toBe(true);
  });
});

describe("describeRecord", () => {
  it("decodes scanned records that arrive as DataViews", () => {
    const view = (text: string) => {
      const bytes = new TextEncoder().encode(text);
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    };
    expect(
      describeRecord({ recordType: "url", data: view("https://renderhane.com") })
    ).toMatchObject({ kind: "url", value: "https://renderhane.com" });
    expect(describeRecord({ recordType: "text", data: view("merhaba") })).toMatchObject({
      kind: "text",
      value: "merhaba",
    });
    expect(describeRecord({ recordType: AAR_TYPE, data: view("com.renderhane.app") })).toMatchObject(
      { kind: "app", value: "com.renderhane.app" }
    );
  });

  it("names the network for Wi-Fi records and the person for vCards", () => {
    const wifi = buildWifiWscPayload({ ssid: "OfisWiFi", password: "x" });
    expect(describeRecord({ recordType: "mime", mediaType: WSC_MIME, data: wifi })).toMatchObject({
      kind: "wifi",
      value: "OfisWiFi",
    });

    const [vcard] = buildNdefRecords("vcard", { firstName: "Ayse", lastName: "Kaya" });
    expect(
      describeRecord({ recordType: "mime", mediaType: VCARD_MIME, data: vcard.data })
    ).toMatchObject({ kind: "vcard", value: "Ayse Kaya" });
  });

  it("maps records back to the form state that produced them", () => {
    const roundTrip = (type: Parameters<typeof buildNdefRecords>[0], fields: Record<string, string>) =>
      recordsToForm(buildNdefRecords(type, fields).map((r) => describeRecord(r)));

    expect(roundTrip("url", { url: "renderhane.com" })).toEqual({
      type: "url",
      fields: { url: "https://renderhane.com" },
    });
    expect(roundTrip("phone", { phone: "+905551234567" })).toEqual({
      type: "phone",
      fields: { phone: "+905551234567" },
    });
    expect(roundTrip("email", { email: "a@b.com", subject: "Merhaba Dünya" })).toEqual({
      type: "email",
      fields: { email: "a@b.com", subject: "Merhaba Dünya" },
    });
    expect(roundTrip("sms", { phone: "+905551234567", body: "selam" })).toEqual({
      type: "sms",
      fields: { phone: "+905551234567", body: "selam" },
    });
    expect(roundTrip("location", { lat: "41.0082", lon: "28.9784" })).toEqual({
      type: "location",
      fields: { lat: "41.0082", lon: "28.9784" },
    });
    expect(roundTrip("text", { text: "merhaba" })).toEqual({
      type: "text",
      fields: { text: "merhaba" },
    });
  });

  it("prefers the Android app record over its Play Store fallback URL", () => {
    const form = recordsToForm(
      buildNdefRecords("app", { packageName: "com.renderhane.app" }).map((r) => describeRecord(r))
    );
    expect(form).toEqual({ type: "app", fields: { packageName: "com.renderhane.app" } });
  });

  it("recovers Wi-Fi credentials and contact fields for re-editing", () => {
    const wifi = recordsToForm(
      buildNdefRecords("wifi", { ssid: "Ofis", password: "sifre123" }).map((r) => describeRecord(r))
    );
    expect(wifi).toEqual({
      type: "wifi",
      fields: { ssid: "Ofis", password: "sifre123", encryption: "WPA" },
    });

    const open = recordsToForm(
      buildNdefRecords("wifi", { ssid: "Cafe", encryption: "nopass" }).map((r) => describeRecord(r))
    );
    expect(open).toEqual({
      type: "wifi",
      fields: { ssid: "Cafe", password: "", encryption: "nopass" },
    });

    const contact = recordsToForm(
      buildNdefRecords("vcard", {
        firstName: "Ayse",
        lastName: "Kaya",
        phone: "+905551234567",
        org: "Renderhane",
        instagram: "renderhane",
        whatsapp: "905551234567",
      }).map((r) => describeRecord(r))
    );
    expect(contact).toEqual({
      type: "vcard",
      fields: {
        firstName: "Ayse",
        lastName: "Kaya",
        phone: "+905551234567",
        org: "Renderhane",
        instagram: "renderhane",
        whatsapp: "905551234567",
      },
    });
  });

  it("has nothing to load from an empty tag", () => {
    expect(recordsToForm([{ kind: "empty", value: "" }])).toBeNull();
  });

  it("reports blank and unknown records instead of throwing", () => {
    expect(describeRecord({ recordType: "empty" })).toEqual({ kind: "empty", value: "" });
    expect(describeRecord({ recordType: "example.com:custom" })).toMatchObject({
      kind: "unknown",
      value: "example.com:custom",
    });
  });
});
