interface HealthAlertProps {
  service: string;
  errorMessage?: string;
  downSince?: string;
  consecutiveFailures?: number;
}

/**
 * Email sent to admins when fal.ai goes DOWN.
 */
export function buildServiceDownEmail({
  service,
  errorMessage,
  consecutiveFailures,
}: HealthAlertProps) {
  return {
    subject: `🔴 ${service} servis kesintisi — Renderhane`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#dc2626;padding:24px 32px;text-align:center;">
          <h1 style="color:#fff;font-size:20px;margin:0;">⚠️ Servis Kesintisi</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;line-height:1.6;color:#1f2937;margin:0 0 16px;">
            <strong>${service}</strong> servisi yanıt vermiyor.
          </p>
          ${errorMessage ? `<p style="font-size:14px;color:#6b7280;background:#f3f4f6;padding:12px;border-radius:8px;margin:0 0 16px;font-family:monospace;">${errorMessage}</p>` : ""}
          <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
            Arka arkaya başarısız kontrol: <strong>${consecutiveFailures ?? 1}</strong>
          </p>
          <p style="font-size:14px;color:#6b7280;margin:0;">
            Kullanıcılara bakım mesajı gösterilmeye başlandı. Servis düzeldiğinde otomatik olarak açılacak.
          </p>
          <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
            Renderhane Sağlık İzleme — Otomatik E-posta
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

/**
 * Email sent to admins when fal.ai RECOVERS.
 */
export function buildServiceRecoveredEmail({
  service,
  downSince,
}: HealthAlertProps) {
  return {
    subject: `🟢 ${service} servisi düzeldi — Renderhane`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#16a34a;padding:24px 32px;text-align:center;">
          <h1 style="color:#fff;font-size:20px;margin:0;">✅ Servis Düzeldi</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;line-height:1.6;color:#1f2937;margin:0 0 16px;">
            <strong>${service}</strong> servisi tekrar çalışıyor.
          </p>
          ${downSince ? `<p style="font-size:14px;color:#6b7280;margin:0 0 8px;">Kesinti başlangıcı: <strong>${downSince}</strong></p>` : ""}
          <p style="font-size:14px;color:#6b7280;margin:0;">
            Kullanıcılar artık tekrar işlem yapabilir. Otomatik olarak açıldı.
          </p>
          <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
            Renderhane Sağlık İzleme — Otomatik E-posta
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
