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

  // iyzico
  iyzicoApiKey: requireEnv("IYZICO_API_KEY"),
  iyzicoSecretKey: requireEnv("IYZICO_SECRET_KEY"),
  iyzicoBaseUrl: process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com",

  // App
  appUrl: requireEnv("NEXT_PUBLIC_APP_URL"),
} as const;
