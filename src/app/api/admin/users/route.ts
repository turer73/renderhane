import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin-check";

export async function GET(request: NextRequest) {
  try {
  // 1. Auth + admin check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse query params
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
  const search = searchParams.get("search")?.trim() || "";
  const offset = (page - 1) * limit;

  const admin = createAdminClient();

  // 3. Fetch profiles with job counts
  let query = admin
    .from("profiles")
    .select("id, display_name, credit_balance, referral_code, referral_count, unlimited_bg_remove, created_at, jobs:jobs(count)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    // Escape LIKE wildcards to prevent pattern injection
    const escaped = search.replace(/[%_\\]/g, "\\$&");
    query = query.ilike("display_name", `%${escaped}%`);
  }

  const { data: profiles, count: totalProfiles, error: profilesError } = await query;

  if (profilesError) {
    console.error("[admin/users] profiles query error:", profilesError.message);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }

  // 4. Fetch auth users to get emails
  // For small user bases, fetch all auth users; for larger ones pagination needed
  const {
    data: { users: authUsers },
    error: authError,
  } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (authError) {
    console.error("[admin/users] auth users query error:", authError.message);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }

  // 5. Create email lookup map
  const emailMap = new Map<string, string>();
  for (const u of authUsers) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  // 6. Merge profiles with emails and job counts
  const users = (profiles ?? []).map((p) => ({
    id: p.id as string,
    email: emailMap.get(p.id as string) || "—",
    displayName: (p.display_name as string) || "",
    creditBalance: p.credit_balance as number,
    referralCode: (p.referral_code as string) || "",
    referralCount: p.referral_count as number,
    unlimitedBgRemove: p.unlimited_bg_remove as boolean,
    createdAt: p.created_at as string,
    jobCount:
      Array.isArray(p.jobs) && p.jobs.length > 0
        ? (p.jobs[0] as { count: number }).count
        : 0,
  }));

  // 7. If searching by email (display_name search yielded few results), also filter by email
  let filteredUsers = users;
  if (search && !users.some((u) => u.displayName.toLowerCase().includes(search.toLowerCase()))) {
    // Re-filter including email matches
    filteredUsers = users.filter(
      (u) =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.displayName.toLowerCase().includes(search.toLowerCase())
    );
  }

  // 8. Compute aggregate stats from all auth users for the overview
  const totalUsers = authUsers.length;

  // Fetch aggregate stats using admin client
  const [jobsResult, creditsResult, activeResult] = await Promise.all([
    admin.from("jobs").select("id", { count: "exact", head: true }),
    admin
      .from("credit_transactions")
      .select("amount")
      .eq("type", "spend")
      .eq("status", "completed"),
    admin
      .from("jobs")
      .select("user_id")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const totalJobs = jobsResult.count ?? 0;
  const creditsSpent = (creditsResult.data ?? []).reduce(
    (sum, tx) => sum + Math.abs(tx.amount as number),
    0
  );
  const activeUserIds = new Set(
    (activeResult.data ?? []).map((j) => j.user_id as string)
  );
  const activeUsers7d = activeUserIds.size;

  return NextResponse.json({
    users: filteredUsers,
    total: totalProfiles ?? 0,
    page,
    limit,
    stats: {
      totalUsers,
      totalJobs,
      creditsSpent,
      activeUsers7d,
    },
  });
  } catch (error) {
    console.error("[admin/users] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
