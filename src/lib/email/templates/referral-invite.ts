/** Escape HTML special characters to prevent injection in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ReferralInviteProps {
  referrerName: string;
  referralLink: string;
  locale: "tr" | "en";
}

const CONTENT = {
  tr: {
    subject: (name: string) => `${name} seni Renderhane'ye davet ediyor — 25 kredi hediye!`,
    heading: "AI ile Urun Gorseli Uretimi",
    body: (name: string) =>
      `Arkadaşın ${name}, seni Renderhane'ye davet ediyor. Kayıt ol ve hemen 25 kredi kazan — arka plan silme ozelligi sınırsız ucretsiz!`,
    cta: "Kayıt Ol ve Kredini Al",
    footer: "Bu e-postayi bir Renderhane kullanicisinin daveti uzerine aldınız.",
  },
  en: {
    subject: (name: string) => `${name} invited you to Renderhane — 25 free credits!`,
    heading: "AI Product Visual Generation",
    body: (name: string) =>
      `Your friend ${name} invited you to Renderhane. Sign up now and earn 25 credits — background removal is unlimited and free!`,
    cta: "Sign Up & Claim Credits",
    footer: "You received this email because a Renderhane user invited you.",
  },
};

export function buildReferralInviteEmail({ referrerName, referralLink, locale }: ReferralInviteProps) {
  const t = CONTENT[locale] || CONTENT.tr;
  // Validate referral link protocol to prevent javascript: injection
  const safeLink = referralLink.startsWith("https://") ? referralLink : "#";

  return {
    subject: t.subject(referrerName),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center;">
          <h1 style="color:#fff;font-size:24px;margin:0;">renderhane.</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">${t.heading}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="font-size:16px;line-height:1.6;color:#1f2937;margin:0 0 24px;">
            ${escapeHtml(t.body(referrerName))}
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${safeLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
                ${t.cta}
              </a>
            </td></tr>
          </table>
          <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">
            ${t.footer}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
