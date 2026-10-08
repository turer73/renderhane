"use client";

import { Check, Circle, Loader2, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LabPhase } from "@/lib/admin/model-lab-flow";

const STEPS = ["uploading", "validating", "queue", "running"] as const;
type Step = (typeof STEPS)[number] | "completed" | "failed" | "unknown";
type StepState = "done" | "current" | "todo";

const CHIP = "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium";
const TONE: Record<StepState | "failed" | "unknown", string> = {
  done: "border-primary/30 bg-primary/10 text-primary",
  current: "border-primary bg-primary text-primary-foreground",
  todo: "border-border text-muted-foreground",
  failed: "border-destructive bg-destructive/10 text-destructive",
  unknown: "border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300",
};

function StepIcon({ step, state }: { step: Step; state: StepState }) {
  if (state === "done") return <Check className="size-3.5" aria-hidden />;
  if (state === "todo") return <Circle className="size-3.5" aria-hidden />;
  if (step === "completed") return <Check className="size-3.5" aria-hidden />;
  if (step === "failed") return <X className="size-3.5" aria-hidden />;
  if (step === "unknown") return <TriangleAlert className="size-3.5" aria-hidden />;
  return <Loader2 className="size-3.5 animate-spin" aria-hidden />;
}

/**
 * The current attempt, step by step: local upload and validation first, then
 * the provider's queue and run, ending in completed, failed or unknown.
 */
export function LabProgress({ phase }: { phase: LabPhase }) {
  const t = useTranslations("modelLab");
  const terminal = phase === "completed" || phase === "failed" || phase === "unknown" ? phase : null;
  const steps: Step[] = [...STEPS, terminal ?? "completed"];
  const current = phase === "idle" ? -1 : terminal ? steps.length - 1 : STEPS.indexOf(phase as (typeof STEPS)[number]);

  return (
    <section aria-label={t("phases.label")} className="min-w-0 rounded-xl border bg-card p-4">
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const state: StepState = index < current ? "done" : index === current ? "current" : "todo";
          const tone = state === "current" && (step === "failed" || step === "unknown") ? TONE[step] : TONE[state];
          return (
            <li key={step} aria-current={state === "current" ? "step" : undefined} className={`${CHIP} ${tone}`}>
              <StepIcon step={step} state={state} />
              {t(`phases.${step}`)}
            </li>
          );
        })}
      </ol>
      {phase !== "idle" && <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">{t(`phaseHints.${phase}`)}</p>}
    </section>
  );
}
