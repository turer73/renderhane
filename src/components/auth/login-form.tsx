"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function LoginForm() {
  const t = useTranslations("common");
  const tAuth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  async function handleMagicLink() {
    if (!email) return;
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    setMessage(tAuth("checkEmail"));
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-center">{t("appName")}</CardTitle>
        <p className="text-center text-muted-foreground text-sm">
          {t("tagline")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleGoogleLogin}
          variant="outline"
          className="w-full"
        >
          {tAuth("googleLogin")}
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

        <Button onClick={handleMagicLink} className="w-full" disabled={loading}>
          {loading ? tAuth("sending") : tAuth("sendMagicLink")}
        </Button>

        {message && (
          <p className="text-center text-sm text-green-600">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
