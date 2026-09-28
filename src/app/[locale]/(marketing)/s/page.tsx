import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { socialLinksFromParams } from "@/lib/share-links";

export const metadata: Metadata = {
  title: "Sosyal bağlantılar | Renderhane",
  robots: { index: false, follow: false },
};

type Query = Record<string, string | string[] | undefined>;

function toParams(query: Query): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

export default async function SocialCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  if (locale !== "tr" && locale !== "en") notFound();
  const query = toParams(await searchParams);
  const links = socialLinksFromParams(query, locale);
  if (!links.length) notFound();
  const name = (query.get("n") || (locale === "tr" ? "Sosyal bağlantılar" : "Social links")).slice(0, 80);

  return (
    <main className="min-h-[70vh] bg-background px-4 py-16 text-foreground">
      <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            {name.trim().charAt(0).toLocaleUpperCase(locale) || "R"}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {locale === "tr" ? "Bağlanmak istediğin ağı seç." : "Choose a network to connect."}
          </p>
        </div>
        <div className="grid gap-3">
          {links.map((link) => (
            <a
              key={`${link.platform}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex min-h-14 items-center justify-between rounded-2xl border border-border bg-background px-5 py-4 font-semibold transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span>{link.label}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          {locale === "tr" ? "Bilgiler veritabanına kaydedilmez; URL içinde taşınır ve bağlantıyı bilen kişi tarafından görülebilir." : "The data is not saved to the database; it travels in the URL and can be seen by anyone who has the link."}
        </p>
      </section>
    </main>
  );
}
