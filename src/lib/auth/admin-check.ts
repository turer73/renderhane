import "server-only";

/**
 * Check if a user email is in the admin list.
 * Admin emails are defined in ADMIN_EMAILS env variable (comma-separated).
 * This is a server-only module — never import from client components.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase());
}
