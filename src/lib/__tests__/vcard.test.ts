import { describe, expect, it } from "vitest";
import { buildVCard, parseVCard } from "../vcard";

describe("buildVCard", () => {
  it("uses vCard 3.0 name components and CRLF separators", () => {
    const card = buildVCard({ firstName: "Turgut", lastName: "Ürer", phone: "+905551234567" });
    expect(card).toContain("N:Ürer;Turgut;;;");
    expect(card).toContain("FN:Turgut Ürer");
    expect(card).toContain("\r\n");
    expect(card.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("prevents query fields from injecting new vCard properties", () => {
    const card = buildVCard({ firstName: "Turgut\r\nURL:https://evil.example" });
    expect(card).not.toContain("\r\nURL:https://evil.example");
    expect(card).toContain("Turgut\\nURL:https://evil.example");
  });

  it("round-trips escaped names, organizations, addresses, and newlines", () => {
    const original = {
      firstName: "Tur;gut",
      lastName: "Urer, Jr.",
      org: "Acme, Inc.",
      address: "Hasan; Celebi, Sokak",
      title: "Kurucu\nTasarimci",
    };
    expect(parseVCard(buildVCard(original))).toMatchObject(original);
  });

  it("does not join an unencoded value that legitimately ends with equals", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "URL:https://example.com/?token=", "EMAIL:ada@example.com", "END:VCARD"].join("\r\n");
    expect(parseVCard(card)).toMatchObject({
      website: "https://example.com/?token=", email: "ada@example.com",
    });
  });

  it("preserves complete Instagram destinations when restoring", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://www.instagram.com/p/example", "END:VCARD"].join("\r\n");
    expect(parseVCard(card).instagram).toBe("https://www.instagram.com/p/example");
  });

  it("decodes quoted-printable UTF-8 values and soft line breaks", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=9Crer;Tur=",
      "gut;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Turgut =C3=9Crer",
      "END:VCARD"].join("\r\n");
    expect(parseVCard(card)).toMatchObject({firstName: "Turgut", lastName: "Ürer"});
  });

  it("normalizes URI-valued telephone properties for editing", () => {
    const card = ["BEGIN:VCARD", "VERSION:4.0", "FN:Ada Lovelace",
      "TEL;VALUE=uri:tel:+905551234567", "END:VCARD"].join("\r\n");
    expect(parseVCard(card).phone).toBe("+905551234567");
  });

  it("keeps structured address components read-only", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "ADR;TYPE=WORK:;;123 Main St;London;;SW1;UK", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(card)).toThrow(/Yapılandırılmış adres/);
    const streetOnly = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "ADR;TYPE=WORK:;;123 Main St;;;;", "END:VCARD"].join("\r\n");
    expect(parseVCard(streetOnly).address).toBe("123 Main St");
  });

  it("keeps unsupported telephone types and multiple websites read-only", () => {
    const workPhone = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "TEL;TYPE=WORK:+905551234567", "END:VCARD"].join("\r\n");
    const typedEmail = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "EMAIL;TYPE=WORK:ada@example.com", "END:VCARD"].join("\r\n");
    const websites = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://work.example.com", "item2.URL:https://personal.example.com",
      "END:VCARD"].join("\r\n");
    expect(() => parseVCard(workPhone)).toThrow(/Telefon türü/);
    expect(() => parseVCard(typedEmail)).toThrow(/E-posta türü/);
    expect(() => parseVCard(websites)).toThrow(/Birden fazla web adresi/);
  });

  it("recognizes grouped email, phone, and labeled social URLs", () => {
    const grouped = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.EMAIL:ada@example.com",
      "item2.TEL;TYPE=CELL:+905551234567",
      "item3.URL:https://www.instagram.com/renderhane",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVCard(grouped)).toMatchObject({
      email: "ada@example.com", phone: "+905551234567", instagram: "https://www.instagram.com/renderhane",
    });
  });

  it("unfolds standards-compliant continuation lines before parsing", () => {
    const folded = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Ada Lovelace",
      "ORG:Render",
      " hane",
      "URL:https://example.com/a/very/long/",
      " path",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVCard(folded)).toMatchObject({
      firstName: "Ada", lastName: "Lovelace", org: "Renderhane",
      website: "https://example.com/a/very/long/path",
    });
  });

  it("declines to edit cards with additional phone, email, or address values", () => {
    const phones = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "TEL:+905551111111", "TEL:+905552222222", "END:VCARD"].join("\r\n");
    const emails = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "EMAIL:ada@example.com", "EMAIL:work@example.com", "END:VCARD"].join("\r\n");
    const addresses = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "ADR;TYPE=WORK:;;Home Street;;;;", "ADR;TYPE=WORK:;;Work Street;;;;", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(phones)).toThrow(/Birden fazla telefon/);
    expect(() => parseVCard(emails)).toThrow(/Birden fazla e-posta/);
    expect(() => parseVCard(addresses)).toThrow(/Birden fazla adres/);
  });

  it("recognizes WhatsApp only from an exact grouped wa.me destination", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://example.com/go/wa.me/905551234567", "END:VCARD"].join("\r\n");
    expect(parseVCard(card)).toMatchObject({
      website: "https://example.com/go/wa.me/905551234567",
    });
    expect(parseVCard(card).whatsapp).toBeUndefined();

    const instagramRedirect = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://example.com/go?target=https://instagram.com/renderhane",
      "END:VCARD"].join("\r\n");
    expect(parseVCard(instagramRedirect)).toMatchObject({
      website: "https://example.com/go?target=https://instagram.com/renderhane",
    });
    expect(parseVCard(instagramRedirect).instagram).toBeUndefined();
  });

  it("keeps structured names and unsupported user properties read-only", () => {
    const structured = ["BEGIN:VCARD", "VERSION:3.0", "FN:Dr. John Quincy Doe Jr.",
      "N:Doe;John;Quincy;Dr.;Jr.", "END:VCARD"].join("\r\n");
    const formatted = ["BEGIN:VCARD", "VERSION:3.0", "N:Doe;John;;;",
      "FN:Dr. John Doe", "END:VCARD"].join("\r\n");
    const note = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "NOTE:Important", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(structured)).toThrow(/Ek ad/);
    expect(() => parseVCard(formatted)).toThrow(/Biçimlendirilmiş adı/);
    expect(() => parseVCard(note)).toThrow(/Desteklenmeyen/);
  });

  it("validates formatted names independently of property order", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Dr. John Doe",
      "N:Doe;John;;;", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(card)).toThrow(/Biçimlendirilmiş adı/);
  });

  it("keeps unsupported address types and structured organizations read-only", () => {
    const homeAddress = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "ADR;TYPE=HOME:;;123 Main St;;;;", "END:VCARD"].join("\r\n");
    const organizationUnit = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "ORG:Acme;Research", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(homeAddress)).toThrow(/Adres türü/);
    expect(() => parseVCard(organizationUnit)).toThrow(/Birim bilgisi/);
  });

  it("keeps cards with multiple social destinations read-only", () => {
    const instagram = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://instagram.com/renderhane",
      "item2.URL:https://instagram.com/renderhane3d", "END:VCARD"].join("\r\n");
    const whatsapp = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://wa.me/905551111111",
      "item2.URL:https://wa.me/905552222222", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(instagram)).toThrow(/Birden fazla Instagram/);
    expect(() => parseVCard(whatsapp)).toThrow(/Birden fazla WhatsApp/);
  });

  it("decodes quoted charset parameters without corrupting names", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0",
      "N;CHARSET=\"ISO-8859-1\";ENCODING=QUOTED-PRINTABLE:=DCrer;Ada;;;",
      "FN:Ada Ürer", "END:VCARD"].join("\r\n");
    expect(parseVCard(card)).toMatchObject({ firstName: "Ada", lastName: "Ürer" });
  });

  it("keeps duplicate organizations and titles read-only", () => {
    const organizations = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "ORG:Acme", "ORG:Research", "END:VCARD"].join("\r\n");
    const titles = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "TITLE:Engineer", "TITLE:Founder", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(organizations)).toThrow(/Birden fazla kuruluş/);
    expect(() => parseVCard(titles)).toThrow(/Birden fazla unvan/);
  });

  it("keeps custom URL labels and non-HTTP URLs read-only", () => {
    const labeled = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://example.com", "item1.X-ABLabel:Portfolio",
      "END:VCARD"].join("\r\n");
    const ftp = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "URL:ftp://files.example.com", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(labeled)).toThrow(/Özel bağlantı etiketi/);
    expect(() => parseVCard(ftp)).toThrow(/HTTP dışındaki/);
  });

  it("folds generated content lines at 75 UTF-8 octets without changing values", () => {
    const original = {
      firstName: "Ü".repeat(40),
      lastName: "Ç".repeat(40),
      org: "Renderhane ".repeat(12).trim(),
    };
    const card = buildVCard(original);
    const encoder = new TextEncoder();
    expect(card.split("\r\n").every((line) => encoder.encode(line).length <= 75)).toBe(true);
    expect(parseVCard(card)).toMatchObject(original);
  });

  it("preserves URI punctuation in website values", () => {
    const website = "https://example.com/a,b;c#/contact";
    const card = buildVCard({ firstName: "Ada", website });
    expect(card).toContain(`URL:${website}`);
    expect(parseVCard(card).website).toBe(website);
  });
});
