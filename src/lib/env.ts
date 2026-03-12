import "server-only";

/**
 * Runtime environment validation with lazy access.
 * Variables are validated only when first accessed, not at module load time.
 * This prevents build failures when env vars are unavailable during SSG.
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

/** Lazily validated server-side environment variables */
export const env = {
  // Supabase
  get supabaseUrl() { return requireEnv("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseAnonKey() { return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get supabaseServiceRoleKey() { return requireEnv("SUPABASE_SERVICE_ROLE_KEY"); },

  // fal.ai
  get falKey() { return requireEnv("FAL_KEY"); },
  get falWebhookSecret() { return requireEnv("FAL_WEBHOOK_SECRET"); },

  // iyzico
  get iyzicoApiKey() { return requireEnv("IYZICO_API_KEY"); },
  get iyzicoSecretKey() { return requireEnv("IYZICO_SECRET_KEY"); },
  get iyzicoBaseUrl() { return requireEnv("IYZICO_BASE_URL"); },

  // Cloudflare R2
  get r2AccountId() { return requireEnv("R2_ACCOUNT_ID"); },
  get r2AccessKeyId() { return requireEnv("R2_ACCESS_KEY_ID"); },
  get r2SecretAccessKey() { return requireEnv("R2_SECRET_ACCESS_KEY"); },
  get r2BucketName() { return requireEnv("R2_BUCKET_NAME"); },
  get r2PublicUrl() { return requireEnv("R2_PUBLIC_URL"); },

  // App
  get appUrl() { return requireEnv("NEXT_PUBLIC_APP_URL"); },

  // Email
  get resendApiKey() { return requireEnv("RESEND_API_KEY"); },

  // Cron
  get cronSecret() { return requireEnv("CRON_SECRET"); },

  // Admin
  get adminEmails() { return process.env.ADMIN_EMAILS || ""; },
} as const;
