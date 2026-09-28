import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/share-links";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "en" ? "Contact card | Renderhane" : "Kişi kartı | Renderhane",
    robots: { index: false, follow: false },
  };
}

type Query = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined, max = 200): string =>
  (typeof value === "string" ? value : "").replace(/[\r\n]/g, " ").trim().slice(0, max);

export default async function ContactCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  if (locale !== "tr" && locale !== "en") notFound();
  const query = await searchParams;
  const firstName = one(query.n, 80);
  if (!firstName) notFound();
  const lastName = one(query.s, 80);
  const phoneValue = one(query.p, 30);
  const phone = phoneValue ? normalizeContactPhone(phoneValue) || "" : "";
  if (phoneValue && !phone) notFound();
  const emailValue = one(query.e, 200);
  const email = emailValue ? normalizeContactEmail(emailValue) || "" : "";
  if (emailValue && !email) notFound();
  const org = one(query.o, 120);
  let website = one(query.u, 1000);
  try {
    const parsed = website ? new URL(website) : null;
    if (parsed && (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)) website = "";
  } catch {
    website = "";
  }
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const mailto = encodeURIComponent(email).replace(/%40/gi, "@");
  const download = new URLSearchParams({ n: firstName });
  if (lastName) download.set("s", lastName);
  if (phone) download.set("p", phone);
  if (email) download.set("e", email);
  if (org) download.set("o", org);
  if (website) download.set("u", website);

  return (
    <main className="min-h-[70vh] bg-background px-4 py-16 text-foreground">
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <header className="bg-primary p-7 text-primary-foreground sm:p-10">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-primary-foreground/15 text-2xl font-bold">
            {firstName.charAt(0).toLocaleUpperCase(locale)}{lastName.charAt(0).toLocaleUpperCase(locale)}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
          {org && <p className="mt-2 opacity-80">{org}</p>}
        </header>
        <div className="grid gap-3 p-6 sm:p-8">
          {phone && <a className="rounded-xl border border-border px-4 py-3 hover:border-primary" href={`tel:${phone}`}>{phone}</a>}
          {email && <a className="rounded-xl border border-border px-4 py-3 hover:border-primary" href={`mailto:${mailto}`}>{email}</a>}
          {website && <a className="break-all rounded-xl border border-border px-4 py-3 hover:border-primary" href={website} target="_blank" rel="noopener noreferrer nofollow">{website}</a>}
          <a
            className="mt-3 rounded-xl bg-primary px-5 py-4 text-center font-semibold text-primary-foreground"
            href={`/api/contact-card?${download.toString()}`}
          >
            {locale === "tr" ? "Kişilere ekle" : "Add to contacts"}
          </a>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {locale === "tr" ? "Bilgiler veritabanına kaydedilmez; URL içinde taşınır ve bağlantıyı bilen kişi tarafından görülebilir." : "The data is not saved to the database; it travels in the URL and can be seen by anyone who has the link."}
          </p>
        </div>
      </section>
    </main>
  );
}
