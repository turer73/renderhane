# Free BG-Remove + Referral System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make background removal free (daily limit for all users, unlimited after referral) with a two-sided referral system + email invites via Resend.

**Architecture:** New `referrals` DB table tracks invites. Profiles get referral columns. Auth callback checks referral cookie. Job submission checks free bg-remove eligibility before charging credits. Resend sends invite emails. Dashboard shows referral card.

**Tech Stack:** Supabase (PostgreSQL RPC, RLS), Resend (email), Next.js API routes, React client components.

---

## Task 1: Database Migration — Referral Tables & Profile Columns

**Files:**
- Create: `supabase/migrations/005_referral_system.sql`

**Step 1: Write the migration SQL**

```sql
-- supabase/migrations/005_referral_system.sql

-- ============================================================
-- 1. Add referral columns to profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS unlimited_bg_remove BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS free_bg_remove_daily INTEGER DEFAULT 3 NOT NULL,
  ADD COLUMN IF NOT EXISTS free_bg_remove_used INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS free_bg_remove_date DATE DEFAULT CURRENT_DATE NOT NULL;

-- ============================================================
-- 2. Generate referral codes for existing users
-- ============================================================
UPDATE public.profiles
  SET referral_code = upper(substr(md5(id::text || now()::text), 1, 8))
  WHERE referral_code IS NULL;

-- ============================================================
-- 3. Create referrals table
-- ============================================================
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  referee_email TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  referrer_reward INTEGER DEFAULT 10 NOT NULL,
  referee_reward INTEGER DEFAULT 5 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX idx_referrals_email ON public.referrals(referee_email);

-- RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Service role full access referrals" ON public.referrals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. Generate referral code on new user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_ref_code TEXT;
BEGIN
  -- Generate unique 8-char referral code
  v_ref_code := upper(substr(md5(NEW.id::text || now()::text || random()::text), 1, 8));

  INSERT INTO public.profiles (id, display_name, avatar_url, credit_balance, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    20,
    v_ref_code
  );

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 20, 'bonus', 'Welcome bonus - 20 free credits');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, auth;

-- ============================================================
-- 5. Complete referral RPC (called after referee signs up)
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_referral(
  p_referral_code TEXT,
  p_referee_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_count INTEGER;
  v_referrer_reward INTEGER;
  v_referee_reward INTEGER;
BEGIN
  -- Find pending referral by code for this referee's email
  -- (or any pending referral with this code)
  SELECT r.referrer_id, r.referrer_reward, r.referee_reward
    INTO v_referrer_id, v_referrer_reward, v_referee_reward
    FROM public.referrals r
    WHERE r.referral_code = p_referral_code
      AND r.status = 'pending'
      AND r.referee_id IS NULL
    ORDER BY r.created_at DESC
    LIMIT 1
    FOR UPDATE;

  -- If no pending referral found, check if there's a profile with this code
  -- (direct link referral without email invite)
  IF v_referrer_id IS NULL THEN
    SELECT id INTO v_referrer_id
      FROM public.profiles
      WHERE referral_code = p_referral_code
        AND id != p_referee_id;

    IF v_referrer_id IS NULL THEN
      RETURN FALSE; -- Invalid code
    END IF;

    -- Create a referral record for direct link signups
    v_referrer_reward := 10;
    v_referee_reward := 5;

    INSERT INTO public.referrals (referrer_id, referee_id, referee_email, referral_code, status, referrer_reward, referee_reward, completed_at)
    VALUES (v_referrer_id, p_referee_id, '', p_referral_code, 'completed', v_referrer_reward, v_referee_reward, now());
  ELSE
    -- Update existing email-based referral
    UPDATE public.referrals
      SET referee_id = p_referee_id,
          status = 'completed',
          completed_at = now()
      WHERE referral_code = p_referral_code
        AND status = 'pending'
        AND referee_id IS NULL;
  END IF;

  -- Check referrer's current count (max 5 rewards)
  SELECT referral_count INTO v_referrer_count
    FROM public.profiles WHERE id = v_referrer_id FOR UPDATE;

  IF v_referrer_count < 5 THEN
    -- Reward referrer: +credits + unlimited bg-remove
    UPDATE public.profiles
      SET credit_balance = credit_balance + v_referrer_reward,
          referral_count = referral_count + 1,
          unlimited_bg_remove = TRUE,
          updated_at = now()
      WHERE id = v_referrer_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (v_referrer_id, v_referrer_reward, 'bonus', 'Referral bonus — friend joined');
  END IF;

  -- Reward referee: +credits + unlimited bg-remove
  UPDATE public.profiles
    SET credit_balance = credit_balance + v_referee_reward,
        unlimited_bg_remove = TRUE,
        updated_at = now()
    WHERE id = p_referee_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (p_referee_id, v_referee_reward, 'bonus', 'Referral welcome bonus');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. Check free bg-remove eligibility RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_free_bg_remove(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_unlimited BOOLEAN;
  v_daily_limit INTEGER;
  v_used INTEGER;
  v_last_date DATE;
BEGIN
  SELECT unlimited_bg_remove, free_bg_remove_daily, free_bg_remove_used, free_bg_remove_date
    INTO v_unlimited, v_daily_limit, v_used, v_last_date
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  -- Unlimited users always get free
  IF v_unlimited THEN
    RETURN TRUE;
  END IF;

  -- Reset daily counter if new day
  IF v_last_date < CURRENT_DATE THEN
    UPDATE public.profiles
      SET free_bg_remove_used = 0, free_bg_remove_date = CURRENT_DATE
      WHERE id = p_user_id;
    v_used := 0;
  END IF;

  -- Check daily limit
  IF v_used < v_daily_limit THEN
    -- Increment usage counter
    UPDATE public.profiles
      SET free_bg_remove_used = free_bg_remove_used + 1
      WHERE id = p_user_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

**Step 2: Verify migration syntax is valid**

Run: `cd "C:\R3F Tabanlı Kod İş Modeli" && npx supabase db lint` (if available) or manually review.

**Step 3: Commit**
```bash
git add supabase/migrations/005_referral_system.sql
git commit -m "feat: add referral system database migration"
```

---

## Task 2: Install Resend + Email Infrastructure

**Files:**
- Create: `src/lib/email/resend.ts`
- Create: `src/lib/email/templates/referral-invite.ts`

**Step 1: Install Resend**

Run: `npm install resend`

**Step 2: Create Resend client**

```typescript
// src/lib/email/resend.ts
import "server-only";
import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL = "Renderhane <noreply@renderhane.com>";
```

**Step 3: Create referral invite email template**

```typescript
// src/lib/email/templates/referral-invite.ts

interface ReferralInviteProps {
  referrerName: string;
  referralLink: string;
  locale: "tr" | "en";
}

const CONTENT = {
  tr: {
    subject: (name: string) => `${name} seni Renderhane'ye davet ediyor — 25 kredi hediye!`,
    heading: "AI ile Ürün Görseli Üretimi",
    body: (name: string) =>
      `Arkadaşın ${name}, seni Renderhane'ye davet ediyor. Kayıt ol ve hemen 25 kredi kazan — arka plan silme özelliği sınırsız ücretsiz!`,
    cta: "Kayıt Ol ve Kredini Al",
    footer: "Bu e-postayı bir Renderhane kullanıcısının daveti üzerine aldınız.",
  },
  en: {
    subject: (name: string) => `${name} invited you to Renderhane — 25 free credits!`,
    heading: "AI Product Visual Generation",
    body: (name: string) =>
      `Your friend ${name} invited you to Renderhane. Sign up now and earn 25 credits — background removal is unlimited and free!`,
    cta: "Sign Up & Claim Credits",
    footer: "You received this email because a Renderhane user invited you.",
  },
};

export function buildReferralInviteEmail({ referrerName, referralLink, locale }: ReferralInviteProps) {
  const t = CONTENT[locale] || CONTENT.tr;

  return {
    subject: t.subject(referrerName),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center;">
          <h1 style="color:#fff;font-size:24px;margin:0;">renderhane.</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">${t.heading}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="font-size:16px;line-height:1.6;color:#1f2937;margin:0 0 24px;">
            ${t.body(referrerName)}
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${referralLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
                ${t.cta}
              </a>
            </td></tr>
          </table>
          <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">
            ${t.footer}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
```

**Step 4: Add env variable**

Add to `.env.local`: `RESEND_API_KEY="re_your_api_key_here"`

**Step 5: Commit**
```bash
git add src/lib/email/ package.json package-lock.json
git commit -m "feat: add Resend email client + referral invite template"
```

---

## Task 3: Referral API Endpoints

**Files:**
- Create: `src/app/api/referral/route.ts`
- Create: `src/app/api/referral/invite/route.ts`
- Create: `src/app/api/referral/complete/route.ts`

**Step 1: GET /api/referral — Get user's referral info**

```typescript
// src/app/api/referral/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code, referral_count, unlimited_bg_remove, free_bg_remove_daily, free_bg_remove_used, free_bg_remove_date")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Get referral history
  const { data: referrals } = await supabase
    .from("referrals")
    .select("id, referee_email, status, referrer_reward, created_at, completed_at")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  // Calculate today's remaining free uses
  const isToday = profile.free_bg_remove_date === new Date().toISOString().split("T")[0];
  const usedToday = isToday ? profile.free_bg_remove_used : 0;
  const remainingToday = profile.unlimited_bg_remove
    ? -1 // -1 = unlimited
    : Math.max(0, profile.free_bg_remove_daily - usedToday);

  return NextResponse.json({
    referralCode: profile.referral_code,
    referralLink: `${process.env.NEXT_PUBLIC_APP_URL}/ref/${profile.referral_code}`,
    referralCount: profile.referral_count,
    maxReferrals: 5,
    totalCreditsEarned: (referrals || [])
      .filter((r: { status: string }) => r.status === "completed")
      .reduce((sum: number, r: { referrer_reward: number }) => sum + r.referrer_reward, 0),
    unlimitedBgRemove: profile.unlimited_bg_remove,
    freeBgRemoveToday: remainingToday,
    referrals: referrals || [],
  });
}
```

**Step 2: POST /api/referral/invite — Send email invite**

```typescript
// src/app/api/referral/invite/route.ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resend, FROM_EMAIL } from "@/lib/email/resend";
import { buildReferralInviteEmail } from "@/lib/email/templates/referral-invite";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const locale = (body.locale === "en" ? "en" : "tr") as "tr" | "en";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Don't let users invite themselves
  if (email === user.email) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 });
  }

  // Get referrer profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code, display_name, referral_count")
    .eq("id", user.id)
    .single();

  if (!profile?.referral_code) {
    return NextResponse.json({ error: "no_referral_code" }, { status: 400 });
  }

  // Check max referrals (5)
  if (profile.referral_count >= 5) {
    return NextResponse.json({ error: "max_referrals_reached" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check if already invited this email
  const { data: existing } = await admin
    .from("referrals")
    .select("id")
    .eq("referrer_id", user.id)
    .eq("referee_email", email)
    .single();

  if (existing) {
    return NextResponse.json({ error: "already_invited" }, { status: 409 });
  }

  // Create referral record
  const { error: insertError } = await admin
    .from("referrals")
    .insert({
      referrer_id: user.id,
      referee_email: email,
      referral_code: profile.referral_code,
    });

  if (insertError) {
    console.error("Failed to create referral:", insertError);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // Send invite email
  const referralLink = `${process.env.NEXT_PUBLIC_APP_URL}/ref/${profile.referral_code}`;
  const referrerName = profile.display_name || user.email || "Renderhane User";

  try {
    const { subject, html } = buildReferralInviteEmail({
      referrerName,
      referralLink,
      locale,
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html,
    });
  } catch (emailError) {
    console.error("Failed to send invite email:", emailError);
    // Non-fatal: referral record is created, user can still share link
  }

  return NextResponse.json({ success: true });
}
```

**Step 3: POST /api/referral/complete — Complete referral after signup**

```typescript
// src/app/api/referral/complete/route.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: { referralCode?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { referralCode, userId } = body;

  if (!referralCode || !userId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("complete_referral", {
    p_referral_code: referralCode,
    p_referee_id: userId,
  });

  if (error) {
    console.error("Complete referral failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  return NextResponse.json({ completed: data });
}
```

**Step 4: Commit**
```bash
git add src/app/api/referral/
git commit -m "feat: add referral API endpoints (info, invite, complete)"
```

---

## Task 4: Referral Landing Route (/ref/[code])

**Files:**
- Create: `src/app/ref/[code]/route.ts`

**Step 1: Create redirect route that sets referral cookie**

```typescript
// src/app/ref/[code]/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Redirect to login page with referral context
  const response = NextResponse.redirect(`${baseUrl}/tr/login?ref=${code}`);

  // Set referral code cookie (30 days)
  response.cookies.set("ref_code", code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
```

**Step 2: Commit**
```bash
git add src/app/ref/
git commit -m "feat: add /ref/[code] redirect route with cookie"
```

---

## Task 5: Auth Callback — Process Referral on Signup

**Files:**
- Modify: `src/app/[locale]/(auth)/auth/callback/route.ts`

**Step 1: Update auth callback to check referral cookie**

```typescript
// src/app/[locale]/(auth)/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);
  const code = searchParams.get("code");
  const locale = pathname.split("/")[1] || "tr";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/${locale}/login?error=missing_code`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/${locale}/login?error=auth_failed`
    );
  }

  // Check for referral cookie
  const refCode = request.cookies.get("ref_code")?.value;

  if (refCode) {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Complete referral (non-blocking, fire-and-forget)
      try {
        await fetch(`${baseUrl}/api/referral/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referralCode: refCode, userId: user.id }),
        });
      } catch (err) {
        console.error("Referral completion failed:", err);
      }
    }

    // Clear the referral cookie
    const response = NextResponse.redirect(`${baseUrl}/${locale}/app`);
    response.cookies.delete("ref_code");
    return response;
  }

  return NextResponse.redirect(`${baseUrl}/${locale}/app`);
}
```

**Step 2: Commit**
```bash
git add src/app/*/auth/callback/route.ts
git commit -m "feat: process referral code on auth callback"
```

---

## Task 6: Free BG-Remove in Job Submission

**Files:**
- Modify: `src/lib/jobs/submit.ts` (lines 29-34)
- Modify: `src/app/api/jobs/submit/route.ts`

**Step 1: Add free bg-remove check to submit.ts**

In `src/lib/jobs/submit.ts`, replace the credit reservation section (lines 29-34) with:

```typescript
  // 2. Check free bg-remove eligibility BEFORE reserving credits
  let txId: string | null = null;
  let creditCost = model.creditCost;

  if (tool === "bg-remove") {
    const { data: isFree, error: freeCheckError } = await supabase.rpc(
      "check_free_bg_remove",
      { p_user_id: userId }
    );

    if (!freeCheckError && isFree === true) {
      // Free usage — skip credit reservation, set cost to 0
      creditCost = 0;
    }
  }

  if (creditCost > 0) {
    txId = await reserveCredits(userId, creditCost, `${tool} — ${model.displayName.en}`);
  }
```

Also update the job insert to use the dynamic `creditCost` and nullable `txId`:

```typescript
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
      credit_cost: creditCost,
      credit_tx_id: txId,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    if (txId) await refundCredits(txId);
    throw new Error("Failed to create job");
  }
```

And update the fal.ai submit error handling:

```typescript
  } catch (error) {
    if (txId) await refundCredits(txId);
    // ... rest of error handling unchanged
```

And update the webhook URL to handle null txId:

```typescript
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/fal?jobId=${job.id}${txId ? `&txId=${txId}` : ""}&secret=${process.env.FAL_WEBHOOK_SECRET}`;
```

**Step 2: Update webhook to handle null txId**

In `src/app/api/webhook/fal/route.ts`, make `txId` handling conditional:

```typescript
  // Only confirm/refund if there was a credit transaction
  if (txId) {
    await confirmSpend(txId, jobId);  // or refundCredits(txId) on failure
  }
```

**Step 3: Add freeBgRemove info to the API response in submit route**

Update the return in `src/app/api/jobs/submit/route.ts` to include free status.

**Step 4: Commit**
```bash
git add src/lib/jobs/submit.ts src/app/api/jobs/submit/route.ts src/app/api/webhook/fal/route.ts
git commit -m "feat: free bg-remove for daily limit + unlimited referral users"
```

---

## Task 7: Translation Keys

**Files:**
- Modify: `src/messages/tr.json`
- Modify: `src/messages/en.json`

**Step 1: Add Turkish translations**

Add to `tr.json` root level:

```json
"referral": {
  "title": "Arkadaşını Davet Et",
  "subtitle": "Arkadaşını davet et, ikimiz de kazanalım!",
  "yourLink": "Davet Linkin",
  "copied": "Kopyalandı!",
  "copyLink": "Linki Kopyala",
  "inviteByEmail": "E-posta ile Davet Et",
  "emailPlaceholder": "arkadas@email.com",
  "sendInvite": "Davet Gönder",
  "sending": "Gönderiliyor...",
  "inviteSent": "Davet gönderildi!",
  "progress": "{count}/{max} davet tamamlandı",
  "creditsEarned": "Kazanılan kredi: {total}",
  "reward": "Her davet: +10 kredi",
  "unlimitedBgRemove": "Sınırsız ücretsiz arka plan silme",
  "dailyFree": "Bugün {remaining} ücretsiz arka plan silme hakkınız var",
  "dailyFreeUnlimited": "Sınırsız ücretsiz arka plan silme aktif!",
  "unlockUnlimited": "1 arkadaşını davet et → sınırsız ücretsiz",
  "statusPending": "Bekliyor",
  "statusCompleted": "Tamamlandı",
  "errorAlreadyInvited": "Bu e-posta zaten davet edilmiş",
  "errorInvalidEmail": "Geçerli bir e-posta adresi girin",
  "errorMaxReached": "Maksimum davet sayısına ulaştınız",
  "errorSelf": "Kendinizi davet edemezsiniz",
  "freeBgBanner": "Arka plan silme ÜCRETSİZ!",
  "freeBgBannerSub": "Kayıt ol, günde 3 ücretsiz hak kazan. Arkadaşını davet et → sınırsız!"
}
```

**Step 2: Add English translations**

Add to `en.json` root level:

```json
"referral": {
  "title": "Invite Friends",
  "subtitle": "Invite friends and both of you earn rewards!",
  "yourLink": "Your Invite Link",
  "copied": "Copied!",
  "copyLink": "Copy Link",
  "inviteByEmail": "Invite by Email",
  "emailPlaceholder": "friend@email.com",
  "sendInvite": "Send Invite",
  "sending": "Sending...",
  "inviteSent": "Invite sent!",
  "progress": "{count}/{max} invites completed",
  "creditsEarned": "Credits earned: {total}",
  "reward": "Each invite: +10 credits",
  "unlimitedBgRemove": "Unlimited free background removal",
  "dailyFree": "You have {remaining} free background removals today",
  "dailyFreeUnlimited": "Unlimited free background removal active!",
  "unlockUnlimited": "Invite 1 friend → unlimited free",
  "statusPending": "Pending",
  "statusCompleted": "Completed",
  "errorAlreadyInvited": "This email has already been invited",
  "errorInvalidEmail": "Enter a valid email address",
  "errorMaxReached": "Maximum invite limit reached",
  "errorSelf": "You cannot invite yourself",
  "freeBgBanner": "Background Removal is FREE!",
  "freeBgBannerSub": "Sign up and get 3 free uses daily. Invite a friend → unlimited!"
}
```

**Step 3: Commit**
```bash
git add src/messages/tr.json src/messages/en.json
git commit -m "feat: add referral translation keys (TR/EN)"
```

---

## Task 8: Referral Card Component (Dashboard)

**Files:**
- Create: `src/components/app/referral-card.tsx`

**Step 1: Create the referral card UI**

Full component with:
- Referral link + copy button
- Email invite form (input + send button)
- Progress bar (N/5 invites)
- Credits earned summary
- Free bg-remove status indicator
- Invite history list

This component fetches from `GET /api/referral` and posts to `POST /api/referral/invite`.

**Step 2: Commit**
```bash
git add src/components/app/referral-card.tsx
git commit -m "feat: add ReferralCard dashboard component"
```

---

## Task 9: Integrate Referral Card into Dashboard

**Files:**
- Modify: `src/app/[locale]/(app)/app/page.tsx`
- Modify: `src/components/app/dashboard-content.tsx`

**Step 1: Add ReferralCard below PhotoUpload in dashboard**

Import and place `<ReferralCard />` after the DashboardContent in the dashboard page, or inside DashboardContent itself.

**Step 2: Add referral link to sidebar**

Add a nav item in `src/components/app/sidebar.tsx` pointing to `#referral` anchor or a dedicated `/app/referral` page.

**Step 3: Commit**
```bash
git add src/app/*/app/page.tsx src/components/app/dashboard-content.tsx src/components/app/sidebar.tsx
git commit -m "feat: integrate ReferralCard into app dashboard"
```

---

## Task 10: Free BG-Remove Banner (Landing + Dashboard)

**Files:**
- Create: `src/components/app/free-bg-banner.tsx`
- Modify: `src/components/landing/hero.tsx`

**Step 1: Create promotional banner component**

Gradient banner: "Arka plan silme ÜCRETSİZ! Kayıt ol → günde 3 ücretsiz. Arkadaşını davet et → sınırsız!"

**Step 2: Add banner to landing hero section**

Place below the existing social proof or as a floating badge.

**Step 3: Commit**
```bash
git add src/components/app/free-bg-banner.tsx src/components/landing/hero.tsx
git commit -m "feat: add free bg-remove promotional banner"
```

---

## Task 11: Build Verification + Final Test

**Step 1: Build**
Run: `npm run build`
Expected: Zero errors

**Step 2: Manual verification checklist**
- [ ] `/ref/ABC123` sets cookie and redirects to login
- [ ] Auth callback checks cookie and calls complete_referral
- [ ] `GET /api/referral` returns referral info
- [ ] `POST /api/referral/invite` sends email
- [ ] bg-remove job with daily limit → 0 credits
- [ ] bg-remove job after limit → 1 credit
- [ ] After referral completion → unlimited bg-remove
- [ ] ReferralCard shows in dashboard
- [ ] TR/EN translations work

**Step 3: Commit all remaining changes**
```bash
git add .
git commit -m "feat: complete free bg-remove + referral system"
```

---

## Dependency Graph

```
Task 1 (DB Migration)
  ├── Task 2 (Resend setup) → Task 3 (API endpoints)
  │                              ├── Task 4 (/ref route)
  │                              ├── Task 5 (Auth callback)
  │                              └── Task 6 (Job submission)
  └── Task 7 (Translations)
        ├── Task 8 (ReferralCard)
        │     └── Task 9 (Dashboard integration)
        └── Task 10 (Banner)
              └── Task 11 (Build + verify)
```

Tasks 2 & 7 can run in parallel after Task 1.
Tasks 4, 5, 6 can run in parallel after Task 3.
