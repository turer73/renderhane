import { NextRequest, NextResponse } from "next/server";
import { buildVCard } from "@/lib/vcard";
import {
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/share-links";

const clean = (value: string | null, max: number): string =>
  (value || "").replace(/[\r\n]/g, " ").trim().slice(0, max);

export function GET(request: NextRequest): NextResponse {
  const query = request.nextUrl.searchParams;
  const firstName = clean(query.get("n"), 80);
  if (!firstName) return new NextResponse("Missing contact name", { status: 400 });
  const lastName = clean(query.get("s"), 80);
  const phoneValue = clean(query.get("p"), 30);
  const phone = phoneValue ? normalizeContactPhone(phoneValue) : "";
  if (phoneValue && !phone)
    return new NextResponse("Invalid contact phone", { status: 400 });
  const emailValue = clean(query.get("e"), 200);
  const email = emailValue ? normalizeContactEmail(emailValue) : "";
  if (emailValue && !email)
    return new NextResponse("Invalid contact email", { status: 400 });
  const org = clean(query.get("o"), 120);
  let website = clean(query.get("u"), 1000);
  try {
    const parsed = website ? new URL(website) : null;
    if (parsed && (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)) website = "";
  } catch {
    website = "";
  }
  const card = buildVCard({ firstName, lastName, phone, email, org, website });
  const safeName = `${firstName}-${lastName || "contact"}`.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 80);
  return new NextResponse(card, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.vcf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
