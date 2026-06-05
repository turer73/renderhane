"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";

export function LoginForm() {
  const t = useTranslations("common");
  const tAuth = useTranslations("auth");
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) || "tr";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Capture referral code from URL and persist as cookie
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref && /^[a-f0-9]{8}$/i.test(ref)) {
      document.cookie = `ref_code=${ref}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    }
  }, [searchParams]);

  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/${locale}/auth/callback`,
        },
      });
      if (oauthError) {
        setError(tAuth("errorGeneric"));
      }
    } catch {
      setError(tAuth("errorGeneric"));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
        },
      });
      if (otpError) {
        setError(tAuth("errorGeneric"));
      } else {
        setMessage(tAuth("checkEmail"));
      }
    } catch {
      setError(tAuth("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border/50 shadow-xl shadow-indigo-100/20 dark:shadow-indigo-900/10">
      <CardHeader className="text-center space-y-3">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
          <Image
            src="/logo/icon-light.svg"
            width={28}
            height={28}
            alt="Renderhane"
            unoptimized
            priority
            className="size-7 dark:hidden"
          />
          <Image
            src="/logo/icon-dark.svg"
            width={28}
            height={28}
            alt="Renderhane"
            unoptimized
            priority
            className="hidden size-7 dark:block"
          />
        </div>
        <CardTitle className="text-xl">{t("appName")}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t("tagline")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleGoogleLogin}
          variant="outline"
          className="w-full"
          disabled={googleLoading}
        >
          {googleLoading ? tAuth("sending") : tAuth("googleLogin")}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {tAuth("or")}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{tAuth("emailLabel")}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tAuth("emailPlaceholder")}
          />
        </div>

        <Button onClick={handleMagicLink} className="w-full bg-indigo-600 text-white hover:bg-indigo-700" disabled={loading}>
          {loading ? tAuth("sending") : tAuth("sendMagicLink")}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {tAuth.rich("consent", {
            terms: (chunks) => (
              <Link href={`/${locale}/terms`} className="underline underline-offset-2 hover:text-foreground">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href={`/${locale}/privacy`} className="underline underline-offset-2 hover:text-foreground">
                {chunks}
              </Link>
            ),
          })}
        </p>

        {message && (
          <p className="text-center text-sm text-green-600">{message}</p>
        )}

        {error && (
          <p className="text-center text-sm text-red-600">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
