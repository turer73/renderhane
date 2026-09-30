import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessCardView } from "@/components/share/business-card-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "en" ? "Payment details | Renderhane" : "Ödeme bilgileri | Renderhane",
    robots: { index: false, follow: false },
  };
}

/** Bank / invoice card opened from an NFC tag; the details stay in the URL fragment. */
export default async function BusinessCardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "tr" && locale !== "en") notFound();

  return (
    <main className="min-h-[70vh] bg-background px-4 py-16 text-foreground">
      <BusinessCardView locale={locale} />
    </main>
  );
}
