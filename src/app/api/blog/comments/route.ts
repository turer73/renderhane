import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// GET /api/blog/comments?slug=xxx
export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: comments, error } = await supabase
      .from("blog_comments")
      .select("id, article_slug, display_name, content, is_question, parent_id, created_at")
      .eq("article_slug", slug)
      .order("created_at", { ascending: true });

    if (error) {
      // Table might not exist yet — return empty array gracefully
      return NextResponse.json({ comments: [] });
    }

    // Build tree: separate top-level comments and replies
    const topLevel = comments.filter((c) => !c.parent_id);
    const replies = comments.filter((c) => c.parent_id);

    const tree = topLevel.map((comment) => ({
      ...comment,
      replies: replies.filter((r) => r.parent_id === comment.id),
    }));

    return NextResponse.json({ comments: tree });
  } catch (error) {
    console.error("[blog/comments GET] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/blog/comments
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 5 comments per minute per user
    const rl = await rateLimit(`blog-comment:${user.id}`, RATE_LIMITS.blogComment);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many comments, please wait" }, { status: 429 });
    }

    const body = await request.json();
    const { slug, content, isQuestion, parentId } = body;

    if (!slug || !content?.trim()) {
      return NextResponse.json(
        { error: "slug and content required" },
        { status: 400 }
      );
    }

    // Limit content length to prevent abuse
    const MAX_COMMENT_LENGTH = 2000;
    if (content.trim().length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        { error: `Comment too long (max ${MAX_COMMENT_LENGTH} characters)` },
        { status: 400 }
      );
    }

    // Use user's display name or email
    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Anonim";

    const { data, error } = await supabase
      .from("blog_comments")
      .insert({
        article_slug: slug,
        user_id: user.id,
        display_name: displayName,
        content: content.trim(),
        is_question: isQuestion ?? false,
        parent_id: parentId ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("Comment insert error:", error);
      return NextResponse.json(
        { error: "Failed to post comment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ comment: data });
  } catch (error) {
    console.error("[blog/comments POST] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
