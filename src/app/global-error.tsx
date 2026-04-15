"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#e5e5e5" }}>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#ef4444" }}>Kritik Hata</h1>
          <p style={{ marginTop: "1rem", fontSize: "1.1rem", color: "#a3a3a3" }}>
            Beklenmeyen bir hata oluştu.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: "1.5rem", padding: "0.75rem 1.5rem", borderRadius: "0.75rem", background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500 }}
          >
            Tekrar Dene
          </button>
        </div>
      </body>
    </html>
  );
}
