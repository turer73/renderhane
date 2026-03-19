"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShoppingCart, Gamepad2, Printer } from "lucide-react";

const SEGMENTS = [
  {
    id: "ecommerce" as const,
    icon: ShoppingCart,
    color: "from-indigo-500/15 to-indigo-500/5",
    border: "border-indigo-200 dark:border-indigo-800",
    hover: "hover:border-indigo-400 dark:hover:border-indigo-600",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "gaming" as const,
    icon: Gamepad2,
    color: "from-purple-500/15 to-purple-500/5",
    border: "border-purple-200 dark:border-purple-800",
    hover: "hover:border-purple-400 dark:hover:border-purple-600",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    id: "3dprint" as const,
    icon: Printer,
    color: "from-emerald-500/15 to-emerald-500/5",
    border: "border-emerald-200 dark:border-emerald-800",
    hover: "hover:border-emerald-400 dark:hover:border-emerald-600",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
];

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [selecting, setSelecting] = useState<string | null>(null);

  async function handleSelect(useCase: string) {
    setSelecting(useCase);
    try {
      const res = await fetch("/api/profile/segment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCase }),
      });
      if (res.ok) {
        router.push(`/${locale}/app`);
      }
    } catch {
      setSelecting(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SEGMENTS.map(({ id, icon: Icon, color, border, hover, iconColor }) => (
            <button
              key={id}
              type="button"
              disabled={selecting !== null}
              onClick={() => handleSelect(id)}
              className={`flex flex-col items-center gap-3 rounded-2xl border-2 bg-gradient-to-br p-6 text-center transition-all active:scale-[0.98] disabled:opacity-50 ${color} ${border} ${hover} hover:shadow-lg sm:p-8`}
            >
              {selecting === id ? (
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              ) : (
                <Icon className={`size-10 ${iconColor}`} />
              )}
              <span className="text-base font-semibold">{t(`${id}.title`)}</span>
              <span className="text-xs text-muted-foreground leading-relaxed">
                {t(`${id}.description`)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
