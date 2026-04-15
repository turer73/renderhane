import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-4">
      <h1 className="text-7xl font-bold text-primary">404</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Aradığınız sayfa bulunamadı.
      </p>
      <Link
        href="/tr/app"
        className="mt-6 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Ana Sayfaya Dön
      </Link>
    </div>
  );
}
