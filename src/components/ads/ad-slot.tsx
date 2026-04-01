"use client";

import { useEffect, useRef } from "react";

/**
 * Google AdSense ad slot component.
 *
 * Usage:
 *   <AdSlot slot="1234567890" format="auto" />
 *   <AdSlot slot="1234567890" format="horizontal" />
 *
 * Set NEXT_PUBLIC_ADSENSE_ID in .env.local to your AdSense publisher ID (ca-pub-XXXX).
 * Until configured, this renders a styled placeholder for layout testing.
 */

type AdFormat = "auto" | "horizontal" | "vertical" | "rectangle";

interface AdSlotProps {
  slot: string;
  format?: AdFormat;
  className?: string;
}

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID || "";

export function AdSlot({ slot, format = "auto", className = "" }: AdSlotProps) {
  const adRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADSENSE_ID || pushed.current) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adsbygoogle = (window as any).adsbygoogle || [];
      adsbygoogle.push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded yet — silently ignore
    }
  }, []);

  const formatStyles: Record<AdFormat, string> = {
    auto: "min-h-[90px]",
    horizontal: "min-h-[90px] max-h-[120px]",
    vertical: "min-h-[250px] max-w-[300px]",
    rectangle: "min-h-[250px]",
  };

  // If no AdSense ID configured, show placeholder
  if (!ADSENSE_ID) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-muted-foreground/20 bg-muted/30 text-xs text-muted-foreground/40 ${formatStyles[format]} ${className}`}
      >
        Ad Space
      </div>
    );
  }

  return (
    <div ref={adRef} className={`overflow-hidden ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_ID}
        data-ad-slot={slot}
        data-ad-format={format === "auto" ? "auto" : undefined}
        data-full-width-responsive={format === "auto" ? "true" : undefined}
      />
    </div>
  );
}
