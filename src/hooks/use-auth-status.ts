"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Whether this browser has a Supabase session.
 *
 * `null` until the check resolves, so callers render the signed-out state
 * first — that matches the server render and avoids a hydration mismatch on
 * static marketing pages.
 *
 * Uses `getSession()` (reads the stored session) rather than `getUser()` so
 * public pages don't pay a network round-trip just to label a button. It is
 * a UI hint only — never a permission check; those stay server-side.
 */
export function useAuthStatus(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(Boolean(data.session));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setSignedIn(Boolean(session));
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
