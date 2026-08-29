"use client";

import { useEffect } from "react";
import { getAdSenseScriptUrl } from "@/lib/adsense";

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID || "";
const SCRIPT_ID = "renderhane-adsense";

/**
 * Loads the official Auto ads tag only on public, publisher-content routes.
 * Site ownership is verified separately with google-adsense-account metadata.
 */
export function AdSenseScript() {
  const scriptUrl = getAdSenseScriptUrl(ADSENSE_ID);

  useEffect(() => {
    if (!scriptUrl || document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = scriptUrl;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);

    return () => script.remove();
  }, [scriptUrl]);

  return null;
}
