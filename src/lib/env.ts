import "server-only";

/**
 * Runtime environment validation.
 * Import this in layout.tsx or a server component to fail fast
 * if required environment variables are missing.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Check .env.local.example for reference.`
    );
  }
  return value;
}

/** Validated server-side environment variables */
export const env = {
  // Supabase
  supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),

  // fal.ai
  falKey: requireEnv("FAL_KEY"),
  falWebhookSecret: requireEnv("FAL_WEBHOOK_SECRET"),

  // iyzico
  iyzicoApiKey: requireEnv("IYZICO_API_KEY"),
  iyzicoSecretKey: requireEnv("IYZICO_SECRET_KEY"),
  iyzicoBaseUrl: requireEnv("IYZICO_BASE_URL"),

  // Cloudflare R2
  r2AccountId: requireEnv("R2_ACCOUNT_ID"),
  r2AccessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  r2BucketName: requireEnv("R2_BUCKET_NAME"),
  r2PublicUrl: requireEnv("R2_PUBLIC_URL"),

  // App
  appUrl: requireEnv("NEXT_PUBLIC_APP_URL"),

  // Email
  resendApiKey: requireEnv("RESEND_API_KEY"),

  // Cron
  cronSecret: requireEnv("CRON_SECRET"),

  // Admin
  adminEmails: process.env.ADMIN_EMAILS || "",
} as const;
