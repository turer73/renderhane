"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-4">
      <h1 className="text-5xl font-bold text-destructive">Hata</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Bir şeyler yanlış gitti. Lütfen tekrar deneyin.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Tekrar Dene
      </button>
    </div>
  );
}
