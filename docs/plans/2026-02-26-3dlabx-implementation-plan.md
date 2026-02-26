# 3d-labx MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an e-commerce AI tool portal (3d-labx) that converts product photos into 3D models, removes backgrounds, and enhances images — powered by fal.ai, with Turkish + English UI, iyzico payments, and a credit-based billing system.

**Architecture:** Next.js 15 App Router with fal.ai server proxy for AI model calls, Supabase for auth/DB/realtime, iyzico for Turkish payments, Cloudflare R2 for asset storage. Credit reservation pattern (reserve → spend/refund) ensures financial consistency. Smart Router abstracts fal.ai model differences.

**Tech Stack:** Next.js 15, TypeScript, React Three Fiber, Tailwind CSS, shadcn/ui, next-intl, Supabase (Auth + PostgreSQL + Realtime), fal.ai client SDK, iyzico, Cloudflare R2, Vercel.

**Design Doc:** `docs/plans/2026-02-26-ecommerce-ai-portal-design.md`
**API Research:** `docs/plans/2026-02-26-falai-api-research.md`
**Feasibility:** `docs/plans/2026-02-25-3d-saas-feasibility.md`

---

## Task 1: Project Scaffolding + Core Dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `.env.local.example`
- Create: `.gitignore`

**Step 1: Create Next.js 15 project**

```bash
cd "C:\R3F Tabanlı Kod İş Modeli"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
```

Select defaults when prompted. This creates the App Router project with TypeScript and Tailwind.

**Step 2: Install core dependencies**

```bash
npm install @fal-ai/client @fal-ai/server-proxy @supabase/supabase-js @supabase/ssr next-intl @react-three/fiber @react-three/drei three
npm install -D @types/three
```

**Step 3: Install UI dependencies**

```bash
npx shadcn@latest init
```

Select: New York style, Zinc color, CSS variables = yes.

Then add essential components:

```bash
npx shadcn@latest add button card dialog input label tabs toast sonner badge progress separator dropdown-menu avatar sheet
```

**Step 4: Create `.env.local.example`**

```env
# fal.ai
FAL_KEY=key_id:key_secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# iyzico
IYZICO_API_KEY=your-api-key
IYZICO_SECRET_KEY=your-secret-key
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=3dlabx-assets
R2_PUBLIC_URL=https://assets.3dlabx.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBHOOK_SECRET=your-webhook-secret
```

**Step 5: Verify dev server runs**

```bash
npm run dev
```

Open http://localhost:3000 — should see Next.js default page.

**Step 6: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Next.js 15 project with core dependencies"
```

---

## Task 2: i18n Setup (Turkish + English)

**Files:**
- Create: `src/i18n/request.ts`
- Create: `src/i18n/routing.ts`
- Create: `src/messages/tr.json`
- Create: `src/messages/en.json`
- Create: `src/app/[locale]/layout.tsx`
- Create: `src/app/[locale]/page.tsx`
- Modify: `src/middleware.ts`
- Modify: `next.config.ts`
- Delete: `src/app/layout.tsx`, `src/app/page.tsx` (moved under [locale])

**Step 1: Configure next-intl plugin**

In `next.config.ts`:

```typescript
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig = {};

export default withNextIntl(nextConfig);
```

**Step 2: Create routing config**

`src/i18n/routing.ts`:

```typescript
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
});
```

**Step 3: Create request config**

`src/i18n/request.ts`:

```typescript
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

**Step 4: Create middleware**

`src/middleware.ts`:

```typescript
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/", "/(tr|en)/:path*"],
};
```

**Step 5: Create Turkish message file**

`src/messages/tr.json`:

```json
{
  "common": {
    "appName": "3d-labx",
    "tagline": "Ürün fotoğrafını yükle, gerisini AI yapsın",
    "login": "Giriş Yap",
    "signup": "Kayıt Ol",
    "logout": "Çıkış",
    "credits": "Kredi",
    "settings": "Ayarlar",
    "projects": "Projelerim",
    "upload": "Fotoğraf Yükle",
    "processing": "İşleniyor...",
    "download": "İndir",
    "tryIt": "Ücretsiz Dene"
  },
  "tools": {
    "3dModel": "3D Model Üret",
    "bgRemove": "Arka Plan Kaldır",
    "enhance": "Görseli İyileştir",
    "scene": "Sahne Üret",
    "video": "Video Oluştur",
    "aplus": "A+ İçerik Üret",
    "doAll": "Hepsini Yap"
  },
  "credits": {
    "balance": "Bakiye",
    "buy": "Kredi Satın Al",
    "insufficient": "Kredi yetersiz",
    "cost": "{count} kredi",
    "free": "Ücretsiz"
  },
  "landing": {
    "hero": "E-Ticaret Mağazanız İçin AI Stüdyosu",
    "heroSub": "Tek fotoğraftan 3D model, profesyonel ürün görseli ve video — dakikalar içinde.",
    "stat1": "%94-250 dönüşüm artışı",
    "stat1Sub": "3D ürün görsellerinin kanıtlanmış etkisi",
    "stat2": "₺2'den başlayan fiyat",
    "stat2Sub": "Geleneksel fotoğrafçılığın %95 altında",
    "stat3": "2 dakikada hazır",
    "stat3Sub": "Günler yerine dakikalar",
    "cta": "20 Ücretsiz Kredi ile Başla"
  }
}
```

**Step 6: Create English message file**

`src/messages/en.json`:

```json
{
  "common": {
    "appName": "3d-labx",
    "tagline": "Upload your product photo, let AI do the rest",
    "login": "Log In",
    "signup": "Sign Up",
    "logout": "Log Out",
    "credits": "Credits",
    "settings": "Settings",
    "projects": "My Projects",
    "upload": "Upload Photo",
    "processing": "Processing...",
    "download": "Download",
    "tryIt": "Try Free"
  },
  "tools": {
    "3dModel": "Generate 3D Model",
    "bgRemove": "Remove Background",
    "enhance": "Enhance Image",
    "scene": "Generate Scene",
    "video": "Create Video",
    "aplus": "Generate A+ Content",
    "doAll": "Do Everything"
  },
  "credits": {
    "balance": "Balance",
    "buy": "Buy Credits",
    "insufficient": "Insufficient credits",
    "cost": "{count} credits",
    "free": "Free"
  },
  "landing": {
    "hero": "AI Studio for Your E-Commerce Store",
    "heroSub": "3D models, professional product images, and videos from a single photo — in minutes.",
    "stat1": "94-250% conversion boost",
    "stat1Sub": "Proven impact of 3D product visuals",
    "stat2": "Starting at $0.10",
    "stat2Sub": "95% less than traditional photography",
    "stat3": "Ready in 2 minutes",
    "stat3Sub": "Minutes instead of days",
    "cta": "Start with 20 Free Credits"
  }
}
```

**Step 7: Create locale layout**

Move `src/app/layout.tsx` to `src/app/[locale]/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "./globals.css";

export const metadata: Metadata = {
  title: "3d-labx — AI E-Commerce Studio",
  description: "Upload your product photo, let AI do the rest",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 8: Create locale page**

`src/app/[locale]/page.tsx`:

```typescript
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("landing");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold">{t("hero")}</h1>
      <p className="mt-4 text-xl text-muted-foreground">{t("heroSub")}</p>
    </main>
  );
}
```

**Step 9: Verify both locales work**

```bash
npm run dev
```

- Open http://localhost:3000/tr — should show Turkish text
- Open http://localhost:3000/en — should show English text
- Open http://localhost:3000 — should redirect to /tr (default locale)

**Step 10: Commit**

```bash
git add -A && git commit -m "feat: add i18n with next-intl (Turkish + English)"
```

---

## Task 3: Supabase Auth + Database Schema

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `supabase/migrations/001_initial_schema.sql`
- Modify: `src/middleware.ts` (add Supabase auth refresh)

**Step 1: Create Supabase project**

Go to https://supabase.com/dashboard → New Project → name: `3dlabx`
Copy the URL and anon key into `.env.local`.

Enable Google OAuth in Supabase Dashboard → Auth → Providers → Google.

**Step 2: Create Supabase client (browser)**

`src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Step 3: Create Supabase client (server)**

`src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

**Step 4: Create Supabase middleware helper**

`src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}
```

**Step 5: Update middleware to combine i18n + Supabase**

`src/middleware.ts`:

```typescript
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";
import { type NextRequest } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  return await updateSession(request, response);
}

export const config = {
  matcher: ["/", "/(tr|en)/:path*"],
};
```

**Step 6: Create database migration**

`supabase/migrations/001_initial_schema.sql`:

```sql
-- Users profile (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  locale TEXT DEFAULT 'tr' CHECK (locale IN ('tr', 'en')),
  credit_balance INTEGER DEFAULT 20 NOT NULL CHECK (credit_balance >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Credit transactions (every spend/purchase/refund)
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- positive = purchase/refund, negative = spend
  type TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'refund', 'bonus')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('reserved', 'completed', 'refunded')),
  description TEXT,
  job_id UUID, -- links to jobs table if spend
  payment_id TEXT, -- iyzico payment reference if purchase
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Projects (organize outputs by product)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_image_url TEXT, -- original uploaded photo
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Jobs (fal.ai requests)
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  tool TEXT NOT NULL CHECK (tool IN ('3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus')),
  model_id TEXT NOT NULL, -- fal-ai/trellis, fal-ai/trellis-2, etc.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  fal_request_id TEXT, -- fal.ai queue request_id
  input_params JSONB DEFAULT '{}',
  credit_cost INTEGER NOT NULL,
  credit_tx_id UUID REFERENCES public.credit_transactions(id),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Outputs (generated assets)
CREATE TABLE public.outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('glb', 'image', 'video')),
  fal_url TEXT, -- temporary fal.ai CDN URL (30 day expiry)
  r2_url TEXT, -- permanent Cloudflare R2 URL
  file_size INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_credit_transactions_user ON public.credit_transactions(user_id);
CREATE INDEX idx_projects_user ON public.projects(user_id);
CREATE INDEX idx_jobs_user_status ON public.jobs(user_id, status);
CREATE INDEX idx_jobs_fal_request ON public.jobs(fal_request_id);
CREATE INDEX idx_outputs_job ON public.outputs(job_id);
CREATE INDEX idx_outputs_user ON public.outputs(user_id);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own data
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users read own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users read own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users read own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users read own outputs" ON public.outputs FOR SELECT USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, credit_balance)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    20 -- 20 free credits on signup
  );

  -- Log the bonus credits
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 20, 'bonus', 'Welcome bonus - 20 free credits');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for jobs table (for live status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
```

**Step 7: Run migration**

Apply via Supabase Dashboard → SQL Editor → paste and run, or use Supabase CLI:

```bash
npx supabase db push
```

**Step 8: Verify tables exist**

In Supabase Dashboard → Table Editor — should see: profiles, credit_transactions, projects, jobs, outputs.

**Step 9: Commit**

```bash
git add -A && git commit -m "feat: add Supabase auth + database schema with RLS"
```

---

## Task 4: fal.ai Proxy + Smart Router

**Files:**
- Create: `src/app/api/fal/proxy/route.ts`
- Create: `src/lib/fal/client.ts`
- Create: `src/lib/fal/smart-router.ts`
- Create: `src/lib/fal/models.ts`

**Step 1: Create fal.ai proxy route**

`src/app/api/fal/proxy/route.ts`:

```typescript
import { route } from "@fal-ai/server-proxy/nextjs";

export const { GET, POST } = route;
```

**Step 2: Create fal.ai client config**

`src/lib/fal/client.ts`:

```typescript
import { fal } from "@fal-ai/client";

fal.config({
  proxyUrl: "/api/fal/proxy",
});

export { fal };
```

**Step 3: Create model definitions**

`src/lib/fal/models.ts`:

```typescript
export type ModelTier = "fast" | "standard" | "premium";

export type ToolType = "3d-model" | "bg-remove" | "enhance" | "scene" | "video" | "aplus";

export interface ModelConfig {
  id: string;
  displayName: { tr: string; en: string };
  tier: ModelTier;
  creditCost: number;
  estimatedTime: string; // human readable
  imageParamKey: string; // "image_url" or "input_image_url"
  defaultParams: Record<string, unknown>;
}

export const MODELS: Record<string, ModelConfig> = {
  // 3D Models
  "trellis-v1": {
    id: "fal-ai/trellis",
    displayName: { tr: "TRELLIS v1 — Hızlı", en: "TRELLIS v1 — Fast" },
    tier: "fast",
    creditCost: 2,
    estimatedTime: "~15s",
    imageParamKey: "image_url",
    defaultParams: {
      ss_guidance_strength: 7.5,
      slat_guidance_strength: 3,
      mesh_simplify: 0.95,
      texture_size: 1024,
    },
  },
  "trellis-2": {
    id: "fal-ai/trellis-2",
    displayName: { tr: "TRELLIS 2 — Kaliteli", en: "TRELLIS 2 — Quality" },
    tier: "standard",
    creditCost: 10,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    defaultParams: {
      resolution: 1024,
      ss_guidance_strength: 7.5,
      texture_size: 2048,
      remesh: true,
    },
  },

  // Background Removal
  "birefnet": {
    id: "fal-ai/birefnet/v2",
    displayName: { tr: "Arka Plan Kaldır", en: "Remove Background" },
    tier: "fast",
    creditCost: 1,
    estimatedTime: "~3s",
    imageParamKey: "image_url",
    defaultParams: {},
  },

  // Image Enhancement
  "aura-sr": {
    id: "fal-ai/aura-sr",
    displayName: { tr: "Görseli İyileştir", en: "Enhance Image" },
    tier: "fast",
    creditCost: 2,
    estimatedTime: "~5s",
    imageParamKey: "image_url",
    defaultParams: {},
  },
};

// Tool → available models mapping
export const TOOL_MODELS: Record<ToolType, string[]> = {
  "3d-model": ["trellis-v1", "trellis-2"],
  "bg-remove": ["birefnet"],
  "enhance": ["aura-sr"],
  "scene": [],    // Faz 2
  "video": [],    // Faz 2
  "aplus": [],    // Faz 2
};

// Credit costs per tool (uses default/best model)
export const TOOL_CREDITS: Record<ToolType, number> = {
  "3d-model": 10,  // trellis-2 default
  "bg-remove": 1,
  "enhance": 2,
  "scene": 3,      // Faz 2
  "video": 10,     // Faz 2
  "aplus": 5,      // Faz 2
};
```

**Step 4: Create Smart Router**

`src/lib/fal/smart-router.ts`:

```typescript
import { MODELS, type ModelConfig, type ToolType, type ModelTier } from "./models";

interface RouteRequest {
  tool: ToolType;
  tier?: ModelTier;
  imageUrl: string;
  locale?: string;
}

interface RouteResult {
  model: ModelConfig;
  modelKey: string;
  input: Record<string, unknown>;
}

export function routeRequest(request: RouteRequest): RouteResult {
  const { tool, tier = "standard", imageUrl } = request;

  const modelKey = selectModel(tool, tier);
  const model = MODELS[modelKey];

  // Build input with correct parameter name
  const input: Record<string, unknown> = {
    [model.imageParamKey]: imageUrl,
    ...model.defaultParams,
  };

  return { model, modelKey, input };
}

function selectModel(tool: ToolType, tier: ModelTier): string {
  switch (tool) {
    case "3d-model":
      if (tier === "fast") return "trellis-v1";
      return "trellis-2"; // standard & premium

    case "bg-remove":
      return "birefnet";

    case "enhance":
      return "aura-sr";

    default:
      throw new Error(`Tool "${tool}" is not yet available`);
  }
}
```

**Step 5: Verify proxy works**

```bash
npm run dev
```

No direct test needed yet — proxy will be tested with actual fal.ai calls in Task 6.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add fal.ai proxy, model configs, and smart router"
```

---

## Task 5: Credit Engine

**Files:**
- Create: `src/lib/credits/engine.ts`
- Create: `src/app/api/credits/balance/route.ts`

**Step 1: Create Credit Engine**

`src/lib/credits/engine.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";

export class CreditError extends Error {
  constructor(
    message: string,
    public code: "INSUFFICIENT" | "NOT_FOUND" | "ALREADY_PROCESSED"
  ) {
    super(message);
    this.name = "CreditError";
  }
}

/**
 * Reserve credits before starting a job.
 * Returns the transaction ID for later spend/refund.
 */
export async function reserveCredits(
  userId: string,
  amount: number,
  description: string
): Promise<string> {
  const supabase = await createClient();

  // Check balance
  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();

  if (!profile || profile.credit_balance < amount) {
    throw new CreditError("Insufficient credits", "INSUFFICIENT");
  }

  // Deduct balance and create reserved transaction (atomic via RPC would be ideal)
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credit_balance: profile.credit_balance - amount })
    .eq("id", userId)
    .eq("credit_balance", profile.credit_balance); // optimistic lock

  if (updateError) {
    throw new CreditError("Failed to reserve credits", "ALREADY_PROCESSED");
  }

  const { data: tx, error: txError } = await supabase
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: -amount,
      type: "spend",
      status: "reserved",
      description,
    })
    .select("id")
    .single();

  if (txError || !tx) {
    // Rollback balance
    await supabase
      .from("profiles")
      .update({ credit_balance: profile.credit_balance })
      .eq("id", userId);
    throw new Error("Failed to create transaction");
  }

  return tx.id;
}

/**
 * Confirm the spend after job succeeds.
 */
export async function confirmSpend(txId: string, jobId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("credit_transactions")
    .update({ status: "completed", job_id: jobId })
    .eq("id", txId)
    .eq("status", "reserved");
}

/**
 * Refund credits after job fails.
 */
export async function refundCredits(txId: string): Promise<void> {
  const supabase = await createClient();

  // Get the transaction
  const { data: tx } = await supabase
    .from("credit_transactions")
    .select("user_id, amount")
    .eq("id", txId)
    .eq("status", "reserved")
    .single();

  if (!tx) return; // Already processed

  // Refund balance
  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", tx.user_id)
    .single();

  if (profile) {
    await supabase
      .from("profiles")
      .update({ credit_balance: profile.credit_balance + Math.abs(tx.amount) })
      .eq("id", tx.user_id);
  }

  // Mark as refunded
  await supabase
    .from("credit_transactions")
    .update({ status: "refunded" })
    .eq("id", txId);
}

/**
 * Add credits after purchase.
 */
export async function addCredits(
  userId: string,
  amount: number,
  paymentId: string,
  description: string
): Promise<void> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();

  if (!profile) throw new CreditError("User not found", "NOT_FOUND");

  await supabase
    .from("profiles")
    .update({ credit_balance: profile.credit_balance + amount })
    .eq("id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type: "purchase",
    status: "completed",
    description,
    payment_id: paymentId,
  });
}
```

**Step 2: Create balance API route**

`src/app/api/credits/balance/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ balance: profile?.credit_balance ?? 0 });
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add credit engine with reserve/spend/refund pattern"
```

---

## Task 6: Core Job Submission + Webhook Handler

**Files:**
- Create: `src/lib/jobs/submit.ts`
- Create: `src/app/api/jobs/submit/route.ts`
- Create: `src/app/api/webhook/fal/route.ts`

**Step 1: Create job submission logic**

`src/lib/jobs/submit.ts`:

```typescript
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { reserveCredits } from "@/lib/credits/engine";
import { routeRequest } from "@/lib/fal/smart-router";
import type { ToolType, ModelTier } from "@/lib/fal/models";

interface SubmitJobInput {
  userId: string;
  projectId?: string;
  tool: ToolType;
  tier?: ModelTier;
  imageUrl: string;
}

export async function submitJob(input: SubmitJobInput) {
  const { userId, projectId, tool, tier, imageUrl } = input;
  const supabase = await createClient();

  // 1. Route to correct model
  const { model, modelKey, input: falInput } = routeRequest({
    tool,
    tier,
    imageUrl,
  });

  // 2. Reserve credits
  const txId = await reserveCredits(
    userId,
    model.creditCost,
    `${tool} — ${model.displayName.en}`
  );

  // 3. Create job record
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      project_id: projectId,
      tool,
      model_id: model.id,
      status: "pending",
      input_params: falInput,
      credit_cost: model.creditCost,
      credit_tx_id: txId,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    // Refund if job creation fails
    const { refundCredits } = await import("@/lib/credits/engine");
    await refundCredits(txId);
    throw new Error("Failed to create job");
  }

  // 4. Submit to fal.ai queue with webhook
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/fal?jobId=${job.id}&txId=${txId}`;

  const { request_id } = await fal.queue.submit(model.id, {
    input: falInput,
    webhookUrl,
  });

  // 5. Update job with fal request ID
  await supabase
    .from("jobs")
    .update({
      fal_request_id: request_id,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return {
    jobId: job.id,
    requestId: request_id,
    creditCost: model.creditCost,
    estimatedTime: model.estimatedTime,
  };
}
```

**Step 2: Create job submission API route**

`src/app/api/jobs/submit/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { tool, tier, imageUrl, projectId } = body;

  if (!tool || !imageUrl) {
    return NextResponse.json(
      { error: "tool and imageUrl are required" },
      { status: 400 }
    );
  }

  try {
    const result = await submitJob({
      userId: user.id,
      projectId,
      tool,
      tier,
      imageUrl,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }
    console.error("Job submission failed:", error);
    return NextResponse.json(
      { error: "Job submission failed" },
      { status: 500 }
    );
  }
}
```

**Step 3: Create fal.ai webhook handler**

`src/app/api/webhook/fal/route.ts`:

```typescript
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { confirmSpend, refundCredits } from "@/lib/credits/engine";
import { NextRequest, NextResponse } from "next/server";

// Use service role for webhook (no user context)
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const txId = searchParams.get("txId");

  if (!jobId || !txId) {
    return NextResponse.json({ error: "Missing jobId or txId" }, { status: 400 });
  }

  const body = await request.json();
  const { status, payload, request_id } = body;

  const supabase = getServiceClient();

  if (status === "OK" && payload) {
    // Job succeeded
    const outputUrl = extractOutputUrl(payload);

    // Update job status
    await supabase
      .from("jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Create output record
    if (outputUrl) {
      const { data: job } = await supabase
        .from("jobs")
        .select("user_id, project_id, tool")
        .eq("id", jobId)
        .single();

      if (job) {
        const outputType = getOutputType(job.tool);
        await supabase.from("outputs").insert({
          job_id: jobId,
          user_id: job.user_id,
          project_id: job.project_id,
          type: outputType,
          fal_url: outputUrl,
          metadata: payload,
        });
      }
    }

    // Confirm credit spend
    await confirmSpend(txId, jobId);
  } else {
    // Job failed — refund credits
    const errorMsg = payload?.detail || payload?.message || "Unknown error";

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await refundCredits(txId);
  }

  return NextResponse.json({ received: true });
}

function extractOutputUrl(payload: any): string | null {
  // 3D models
  if (payload.model_mesh?.url) return payload.model_mesh.url;
  if (payload.model_glb?.url) return payload.model_glb.url;
  // Images
  if (payload.image?.url) return payload.image.url;
  // Arrays
  if (payload.images?.[0]?.url) return payload.images[0].url;
  return null;
}

function getOutputType(tool: string): "glb" | "image" | "video" {
  if (tool === "3d-model") return "glb";
  if (tool === "video") return "video";
  return "image";
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add job submission flow + fal.ai webhook handler"
```

---

## Task 7: Auth Pages (Login/Signup)

**Files:**
- Create: `src/app/[locale]/(auth)/login/page.tsx`
- Create: `src/app/[locale]/(auth)/auth/callback/route.ts`
- Create: `src/components/auth/login-form.tsx`

**Step 1: Create login form component**

`src/components/auth/login-form.tsx`:

```typescript
"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const t = useTranslations("common");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  async function handleMagicLink() {
    if (!email) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    alert("Check your email for the login link!");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-center">{t("appName")}</CardTitle>
        <p className="text-center text-muted-foreground text-sm">
          {t("tagline")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleGoogleLogin}
          variant="outline"
          className="w-full"
        >
          Google ile Giriş Yap
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              veya
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@email.com"
          />
        </div>

        <Button onClick={handleMagicLink} className="w-full" disabled={loading}>
          {loading ? "Gönderiliyor..." : "Magic Link Gönder"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Create login page**

`src/app/[locale]/(auth)/login/page.tsx`:

```typescript
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
```

**Step 3: Create auth callback**

`src/app/[locale]/(auth)/auth/callback/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/app`);
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add login page with Google OAuth + magic link"
```

---

## Task 8: App Dashboard + Photo Upload

> **USER CONTRIBUTION POINT:** This task includes the main upload UI and tool selection — a key UX decision point. The component structure will be set up, but the visual layout choices and interaction patterns may benefit from your input.

**Files:**
- Create: `src/app/[locale]/(app)/app/page.tsx`
- Create: `src/app/[locale]/(app)/app/layout.tsx`
- Create: `src/components/app/photo-upload.tsx`
- Create: `src/components/app/tool-selector.tsx`
- Create: `src/components/app/job-status.tsx`
- Create: `src/components/app/credit-badge.tsx`
- Create: `src/components/app/navbar.tsx`

This task builds the core app experience: upload → select tool → process → view results.

Detailed component code will follow the patterns from Tasks 1-7.

**Step 1:** Create app layout with navbar + credit badge
**Step 2:** Create photo upload component (drag & drop + URL paste)
**Step 3:** Create tool selector (shows available tools with credit costs)
**Step 4:** Create job status component (realtime via Supabase)
**Step 5:** Create credit badge (shows balance, links to purchase)
**Step 6:** Wire everything together on `/app` page
**Step 7:** Verify upload → tool select → submit flow works
**Step 8:** Commit

---

## Task 9: 3D Model Viewer

**Files:**
- Create: `src/components/viewer/model-viewer.tsx`
- Create: `src/components/viewer/viewer-controls.tsx`
- Create: `src/app/[locale]/embed/[id]/page.tsx`

Uses React Three Fiber to render GLB files with orbit controls, lighting, and download button. The `/embed/[id]` route provides a public iframe-embeddable viewer.

**Step 1:** Create GLB viewer component with R3F
**Step 2:** Add orbit controls + lighting
**Step 3:** Create embed page (public, no auth)
**Step 4:** Add download buttons (GLB format)
**Step 5:** Verify with a test GLB file
**Step 6:** Commit

---

## Task 10: Landing Page

**Files:**
- Create: `src/app/[locale]/(marketing)/page.tsx` (replaces current page)
- Create: `src/components/landing/hero.tsx`
- Create: `src/components/landing/features.tsx`
- Create: `src/components/landing/pricing.tsx`
- Create: `src/components/landing/demo.tsx`

> **REQUIRED SUB-SKILL:** Use @frontend-design:frontend-design for landing page implementation.

Build a conversion-focused landing page with: hero section, feature grid (6 tools), pricing table (credit packages), live demo (upload → see result), social proof stats.

Fully bilingual using next-intl translations from Task 2.

**Step 1:** Create hero section with CTA
**Step 2:** Create features grid (6 AI tools)
**Step 3:** Create pricing table (4 credit packages in ₺)
**Step 4:** Create interactive demo section
**Step 5:** Create footer with links
**Step 6:** Verify TR + EN versions
**Step 7:** Commit

---

## Task 11: iyzico Payment Integration

**Files:**
- Create: `src/lib/payments/iyzico.ts`
- Create: `src/app/api/payments/checkout/route.ts`
- Create: `src/app/api/webhook/iyzico/route.ts`
- Create: `src/app/[locale]/(app)/app/credits/page.tsx`

Integrate iyzico checkout for credit package purchases. Webhook confirms payment and adds credits via Credit Engine.

**Step 1:** Create iyzico client helper
**Step 2:** Create checkout API route (initiates payment)
**Step 3:** Create iyzico webhook handler (confirms payment → adds credits)
**Step 4:** Create credits purchase page UI
**Step 5:** Test with iyzico sandbox
**Step 6:** Commit

---

## Task 12: Project Management

**Files:**
- Create: `src/app/[locale]/(app)/app/projects/page.tsx`
- Create: `src/app/[locale]/(app)/app/project/[id]/page.tsx`
- Create: `src/components/projects/project-card.tsx`
- Create: `src/components/projects/output-gallery.tsx`

Simple project listing and detail view. Each project shows source image and all generated outputs.

**Step 1:** Create projects list page
**Step 2:** Create project detail page with output gallery
**Step 3:** Create project card component
**Step 4:** Add auto-project creation on first upload
**Step 5:** Commit

---

## Task 13: Production Deployment

**Files:**
- Modify: `.env.local` → production values
- Create: `vercel.json` (if needed)

**Step 1:** Set up Vercel project and connect git repo
**Step 2:** Configure environment variables on Vercel
**Step 3:** Set up custom domain
**Step 4:** Configure iyzico production credentials
**Step 5:** Set up Cloudflare R2 bucket
**Step 6:** Configure fal.ai webhook URL for production
**Step 7:** Deploy and smoke test
**Step 8:** Commit final config

---

## Execution Summary

| Task | Description | Estimated Time |
|------|-------------|---------------|
| 1 | Project Scaffolding | 15 min |
| 2 | i18n (TR + EN) | 30 min |
| 3 | Supabase Auth + DB Schema | 45 min |
| 4 | fal.ai Proxy + Smart Router | 30 min |
| 5 | Credit Engine | 30 min |
| 6 | Job Submission + Webhook | 45 min |
| 7 | Auth Pages | 20 min |
| 8 | App Dashboard + Upload | 60 min |
| 9 | 3D Model Viewer | 45 min |
| 10 | Landing Page | 60 min |
| 11 | iyzico Payment | 60 min |
| 12 | Project Management | 30 min |
| 13 | Production Deploy | 30 min |
| **Total** | | **~8 hours** |
