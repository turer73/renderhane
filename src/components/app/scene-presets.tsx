"use client";

import { useLocale } from "next-intl";
import { SCENE_PRESETS } from "@/lib/scene-presets";
import { cn } from "@/lib/utils";

interface ScenePresetsProps {
  onSelect: (prompt: string, presetId: string) => void;
  selectedPresetId?: string | null;
}

export function ScenePresets({ onSelect, selectedPresetId }: ScenePresetsProps) {
  const locale = useLocale();

  return (
    <div className="flex flex-wrap gap-2">
      {SCENE_PRESETS.map((preset) => {
        const isSelected = selectedPresetId === preset.id;
        const label =
          locale === "tr" ? preset.labelTr : preset.labelEn;

        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.prompt, preset.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all",
              "cursor-pointer select-none whitespace-nowrap",
              isSelected
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                : "border-border/50 bg-background hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:border-indigo-700 dark:hover:bg-indigo-500/5"
            )}
          >
            <span className="text-base leading-none">{preset.icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
