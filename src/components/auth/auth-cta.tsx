"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuthStatus } from "@/hooks/use-auth-status";

/**
 * Top-bar action on the free tool pages.
 *
 * Signed-in visitors used to see "Giriş Yap" here and land on /login, which
 * bounces them to the studio — the flow worked, but the label lied. Once the
 * session is known this points straight at the studio instead.
 */
export function AuthCta({ locale }: { locale: string }) {
  const signedIn = useAuthStatus();
  const tr = locale === "tr";

  return (
    <Link
      href={signedIn ? `/${locale}/app` : `/${locale}/login`}
      className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm transition-all hover:bg-white/25"
    >
      {signedIn
        ? tr
          ? "Uygulamaya Git"
          : "Go to App"
        : tr
          ? "Giriş Yap"
          : "Sign In"}
      <ArrowRight className="ml-1.5 inline size-3.5" />
    </Link>
  );
}
