import { LoginForm } from "@/components/auth/login-form";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const description =
    locale === "tr"
      ? "Renderhane hesabınıza giriş yapın. AI destekli ürün görseli, 3D model ve video üretimine başlayın."
      : "Sign in to your Renderhane account. Start generating AI-powered product visuals, 3D models and videos.";
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com";
  return {
    title: `${t("login")} — ${t("appName")}`,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${BASE_URL}/${locale}/login`,
      languages: { tr: `${BASE_URL}/tr/login`, en: `${BASE_URL}/en/login` },
    },
  };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(`/${locale}/app`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
