"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Wrench } from "lucide-react";

export function RemeshButton() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Wrench className="size-3.5" />
        {locale === "tr" ? "Modelde sorun mu var?" : "Issues with the model?"}
      </button>

      {open && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs dark:border-amber-800 dark:bg-amber-500/10">
          <p className="font-medium text-amber-800 dark:text-amber-200 mb-2">
            {locale === "tr" ? "Modeli Onarma Yöntemleri:" : "How to Repair:"}
          </p>
          <ol className="space-y-1.5 text-amber-700 dark:text-amber-300 list-decimal list-inside">
            <li>
              {locale === "tr"
                ? "Modeli GLB olarak indirin (yukarıdaki indirme butonu)"
                : "Download the model as GLB (download button above)"}
            </li>
            <li>
              {locale === "tr"
                ? "Windows 3D Builder ile açın — otomatik onarır"
                : "Open with Windows 3D Builder — auto-repairs"}
            </li>
            <li>
              {locale === "tr"
                ? "Veya Orca Slicer / PrusaSlicer ile açın (STL olarak kaydeder)"
                : "Or open with Orca Slicer / PrusaSlicer (saves as STL)"}
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
