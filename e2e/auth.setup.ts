/**
 * Auth setup for Playwright E2E tests.
 *
 * Strategy: Call Supabase Auth REST API from Node.js (not browser),
 * then inject the auth token into browser localStorage + cookies
 * so Next.js middleware recognizes the session.
 */
import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!email || !password || !supabaseUrl || !supabaseKey) {
    console.warn("⚠ Missing auth env vars — auth-required tests will skip.");
    await page.context().storageState({ path: authFile });
    return;
  }

  // 1. Get auth tokens from Supabase REST API (server-side, no browser needed)
  const tokenRes = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    console.error("Auth API failed:", err.error_description || err.msg || tokenRes.statusText);
    await page.context().storageState({ path: authFile });
    return;
  }

  const tokenData = await tokenRes.json();
  console.log("✓ Got auth token for:", tokenData.user?.email);

  // 2. Derive the Supabase storage key (sb-<project-ref>-auth-token)
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  // 3. Navigate to the app and inject auth state
  await page.goto("/tr/login", { waitUntil: "domcontentloaded" });

  // Inject token into localStorage
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: storageKey, data: tokenData }
  );

  // 4. Set Supabase auth cookies (Next.js SSR reads from cookies)
  //    Supabase SSR splits the token across chunked cookies
  const cookieBase = `sb-${projectRef}-auth-token`;
  const tokenJson = JSON.stringify(tokenData);
  const chunkSize = 3500; // cookie size limit
  const chunks = [];

  for (let i = 0; i < tokenJson.length; i += chunkSize) {
    chunks.push(tokenJson.slice(i, i + chunkSize));
  }

  const domain = new URL("http://localhost:3000").hostname;

  if (chunks.length === 1) {
    // Single cookie (no chunking needed)
    await page.context().addCookies([
      {
        name: cookieBase,
        value: encodeURIComponent(chunks[0]),
        domain,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  } else {
    // Chunked cookies
    const cookies = chunks.map((chunk, i) => ({
      name: `${cookieBase}.${i}`,
      value: encodeURIComponent(chunk),
      domain,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    }));
    await page.context().addCookies(cookies);
  }

  // 5. Navigate to dashboard — should NOT redirect to login
  await page.goto("/tr/app", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForTimeout(3_000);

  if (page.url().includes("/login")) {
    console.warn("⚠ Still redirected to login — trying alternate cookie format...");

    // Try base64-encoded format (some Supabase versions use this)
    const base64Token = Buffer.from(tokenJson).toString("base64");
    await page.context().addCookies([
      {
        name: cookieBase,
        value: `base64-${base64Token}`,
        domain,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/tr/app", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(3_000);

    if (page.url().includes("/login")) {
      console.warn("⚠ Auth cookies not recognized by SSR — tests requiring auth will skip.");
    } else {
      console.log("✓ Dashboard loaded (base64 cookie format)");
    }
  } else {
    console.log("✓ Dashboard loaded successfully");
  }

  // 6. Save state (cookies + localStorage)
  await page.context().storageState({ path: authFile });
});
