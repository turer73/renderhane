import "server-only";

/**
 * Check if a user email is in the admin list.
 * Admin emails are defined in ADMIN_EMAILS env variable (comma-separated).
 * This is a server-only module — never import from client components.
 *
 * Parsed once and cached as a Set for O(1) lookups.
 */
let _adminEmailsSet: Set<string> | null = null;

function getAdminEmails(): Set<string> {
  if (_adminEmailsSet) return _adminEmailsSet;
  _adminEmailsSet = new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return _adminEmailsSet;
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
}
