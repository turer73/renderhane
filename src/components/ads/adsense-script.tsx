"use client";

import { useEffect, useState } from "react";
import { getAdSenseScriptUrl } from "@/lib/adsense";
import {
  COOKIE_CONSENT_EVENT,
  getCookieConsent,
  type CookieConsent,
} from "@/components/cookie-banner";

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID || "";
const SCRIPT_ID = "renderhane-adsense";

/**
 * Loads the official Auto ads tag only on publisher-content routes after
 * the visitor has opted into advertising cookies.
 */
export function AdSenseScript() {
  const scriptUrl = getAdSenseScriptUrl(ADSENSE_ID);
  const [allowed, setAllowed] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setAllowed(getCookieConsent()?.advertising === true);

    const onConsent = (event: Event) => {
      const consent = (event as CustomEvent<CookieConsent>).detail;
      setAllowed(consent.advertising);
    };

    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!allowed || !scriptUrl) {
      document.getElementById(SCRIPT_ID)?.remove();
      return;
    }
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = scriptUrl;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);

    return () => script.remove();
  }, [allowed, scriptUrl]);

  return null;
}
