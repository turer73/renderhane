"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TOOL_KEYS, type ToolType } from "@/lib/fal/models";

interface ToolOption {
  tool: ToolType;
  icon: string;
}

interface OutputActionsProps {
  imageUrl: string;
  tools: ToolOption[];
  creditCosts: Record<ToolType, number>;
}

export function OutputActions({ imageUrl, tools, creditCosts }: OutputActionsProps) {
  const t = useTranslations("output");
  const tTools = useTranslations("tools");
  const tCredits = useTranslations("credits");
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [submitting, setSubmitting] = useState<string | null>(null);

  async function handleSubmit(tool: ToolType) {
    setSubmitting(tool);
    try {
      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, imageUrl }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.error === "insufficient_credits") {
          toast.error(tCredits("insufficient"));
        } else {
          toast.error(t("errorSubmit"));
        }
        return;
      }

      toast.success(t("started"));

      // Signal dashboard to refresh & navigate
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("job-submitted"));
      }
      router.push(`/${locale}/app`);
    } catch {
      toast.error(t("errorSubmit"));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tools.map(({ tool, icon }) => {
        const toolKey = TOOL_KEYS[tool];
        const cost = creditCosts[tool];
        const isActive = submitting === tool;
        const isDisabled = submitting !== null;

        return (
          <Button
            key={tool}
            type="button"
            variant="outline"
            className="flex h-auto flex-col items-center gap-2 p-4 hover:border-primary hover:bg-primary/5 transition-colors"
            onClick={() => handleSubmit(tool)}
            disabled={isDisabled}
          >
            {isActive ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <ToolIcon name={icon} className="h-8 w-8 text-primary" />
            )}
            <span className="text-sm font-medium">
              {tTools(toolKey)}
            </span>
            <span className="text-xs text-muted-foreground">
              {tCredits("cost", { count: cost })}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function ToolIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "cube":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case "eraser":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </svg>
      );
    case "sparkles":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
      );
    default:
      return null;
  }
}
