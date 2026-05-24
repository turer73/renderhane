import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Redirect old /app/tools/<id> → /app/workspace?tool=<id>
  // Keeps backward compat for bookmarks, Google index, shared links.
  // social-kit excluded — it has its own dedicated pipeline page.
  const toolMatch = request.nextUrl.pathname.match(
    /^\/([a-z]{2})\/app\/tools\/(?!social-kit)([a-z0-9-]+)/
  );
  if (toolMatch) {
    const [, locale, toolId] = toolMatch;
    return NextResponse.redirect(
      new URL(`/${locale}/app?tool=${toolId}`, request.url)
    );
  }

  // Redirect /app/workspace → /app (workspace is now the root)
  const workspaceMatch = request.nextUrl.pathname.match(
    /^\/([a-z]{2})\/app\/workspace\b/
  );
  if (workspaceMatch) {
    const [, wLocale] = workspaceMatch;
    const target = new URL(`/${wLocale}/app`, request.url);
    request.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    return NextResponse.redirect(target);
  }

  // Redirect /app/credits → /app (credits is now a Sheet panel)
  // Preserve ?status= as ?payment= for iyzico callback compat
  const creditsMatch = request.nextUrl.pathname.match(
    /^\/([a-z]{2})\/app\/credits\b/
  );
  if (creditsMatch) {
    const [, cLocale] = creditsMatch;
    const target = new URL(`/${cLocale}/app`, request.url);
    const status = request.nextUrl.searchParams.get("status");
    if (status) target.searchParams.set("payment", status);
    return NextResponse.redirect(target);
  }

  // Redirect /app/batch → /app (batch is a workspace category)
  const batchMatch = request.nextUrl.pathname.match(
    /^\/([a-z]{2})\/app\/batch\b/
  );
  if (batchMatch) {
    const [, bLocale] = batchMatch;
    return NextResponse.redirect(new URL(`/${bLocale}/app`, request.url));
  }

  // Redirect /app/settings → /app (settings is now a Sheet panel)
  const settingsMatch = request.nextUrl.pathname.match(
    /^\/([a-z]{2})\/app\/settings\b/
  );
  if (settingsMatch) {
    const [, sLocale] = settingsMatch;
    return NextResponse.redirect(new URL(`/${sLocale}/app`, request.url));
  }

  const response = intlMiddleware(request);

  // Use a precise regex to detect embed routes (prevents path traversal)
  const isEmbed = /^\/[a-z]{2}\/embed\//.test(request.nextUrl.pathname);

  // Security headers — full CSP
  // Three.js needs 'unsafe-eval' (shader compilation) and blob: (texture fetch + workers)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://analytics.panola.app https://pagead2.googlesyndication.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.fal.media https://assets.renderhane.com https://*.supabase.co https://*.r2.dev",
    "font-src 'self' data:",
    "connect-src 'self' blob: https://*.supabase.co https://*.fal.media https://www.google-analytics.com https://analytics.panola.app https://*.r2.dev https://*.r2.cloudflarestorage.com https://raw.githack.com https://raw.githubusercontent.com",
    "media-src 'self' blob: https://assets.renderhane.com https://*.fal.media",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${isEmbed ? "'self'" : "'none'"}`,
    "report-uri https://csp.3d-labx.com/csp-report",
  ].join("; ");

  // Report-To header (modern browsers)
  response.headers.set(
    "Report-To",
    JSON.stringify({
      group: "csp-endpoint",
      max_age: 86400,
      endpoints: [{ url: "https://csp.3d-labx.com/csp-report" }],
    })
  );

  response.headers.set("Content-Security-Policy", cspDirectives);
  response.headers.set("X-Frame-Options", isEmbed ? "SAMEORIGIN" : "DENY");
  // HSTS + Permissions-Policy vercel.json'da tanımlı — burada tekrar set etme.

  // Embed pages are public — skip auth session refresh
  if (isEmbed) {
    return response;
  }

  return await updateSession(request, response);
}

export const config = {
  matcher: "/((?!api|trpc|ref|icon|apple-icon|opengraph-image|manifest|_next|_vercel|.*\\..*).*)",
};
