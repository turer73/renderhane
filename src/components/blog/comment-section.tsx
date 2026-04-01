"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Comment {
  id: string;
  display_name: string;
  content: string;
  is_question: boolean;
  parent_id: string | null;
  created_at: string;
  user_id: string;
  replies?: Comment[];
}

interface CommentSectionProps {
  slug: string;
  locale: string;
}

export function CommentSection({ slug, locale }: CommentSectionProps) {
  const t = useTranslations("blog");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/blog/comments?slug=${slug}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/blog/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          content: content.trim(),
          isQuestion,
          parentId: replyTo,
        }),
      });

      if (res.status === 401) {
        toast.error(t("loginRequired"));
        return;
      }

      if (!res.ok) {
        toast.error(t("commentError"));
        return;
      }

      toast.success(t("commentPosted"));
      setContent("");
      setIsQuestion(false);
      setReplyTo(null);
      fetchComments();
    } catch {
      toast.error(t("commentError"));
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const questions = comments.filter((c) => c.is_question);
  const discussions = comments.filter((c) => !c.is_question);

  return (
    <div className="space-y-8">
      {/* Comment form */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-lg font-semibold mb-4">
            {t("leaveComment")}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {replyTo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("replyingTo")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyTo(null)}
                  className="h-auto p-0 text-primary"
                >
                  {t("cancelReply")}
                </Button>
              </div>
            )}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("commentPlaceholder")}
              className="w-full min-h-[100px] rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              required
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isQuestion}
                  onChange={(e) => setIsQuestion(e.target.checked)}
                  className="rounded border-border"
                />
                <QuestionIcon className="h-4 w-4 text-amber-500" />
                {t("markAsQuestion")}
              </label>
              <Button type="submit" disabled={submitting || !content.trim()}>
                {submitting ? (
                  <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : null}
                {t("submitComment")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Questions section */}
      {questions.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-4">
            <QuestionIcon className="h-5 w-5 text-amber-500" />
            {t("questions")} ({questions.length})
          </h3>
          <div className="space-y-4">
            {questions.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                locale={locale}
                formatDate={formatDate}
                onReply={(id) => {
                  setReplyTo(id);
                  setIsQuestion(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                t={t}
                isQuestion
              />
            ))}
          </div>
        </div>
      )}

      {/* Discussion section */}
      {discussions.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-4">
            <ChatIcon className="h-5 w-5 text-primary" />
            {t("discussions")} ({discussions.length})
          </h3>
          <div className="space-y-4">
            {discussions.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                locale={locale}
                formatDate={formatDate}
                onReply={(id) => {
                  setReplyTo(id);
                  setIsQuestion(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && comments.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("noComments")}
        </p>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  formatDate,
  onReply,
  t,
  isQuestion,
}: {
  comment: Comment;
  locale?: string;
  formatDate: (d: string) => string;
  onReply: (id: string) => void;
  t: (key: string) => string;
  isQuestion?: boolean;
}) {
  return (
    <Card className={isQuestion ? "border-amber-200 dark:border-amber-800" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {comment.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="text-sm font-medium">{comment.display_name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {formatDate(comment.created_at)}
              </span>
            </div>
          </div>
          {isQuestion && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              {t("question")}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
          {comment.content}
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
            onClick={() => onReply(comment.id)}
          >
            {t("reply")}
          </Button>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-4 ml-6 space-y-3 border-l-2 border-border pl-4">
            {comment.replies.map((reply) => (
              <div key={reply.id}>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {reply.display_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{reply.display_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(reply.created_at)}
                  </span>
                </div>
                <p className="mt-1 ml-8 text-sm leading-relaxed whitespace-pre-wrap">
                  {reply.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}
