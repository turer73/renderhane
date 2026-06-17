-- Harden webhook_queue RPC EXECUTE grants (security)
--
-- webhook_queue tablosu RLS-enabled + policy-yok (sadece service_role) AMA
-- enqueue/dequeue/complete/fail_webhook fonksiyonları SECURITY DEFINER + default
-- PUBLIC EXECUTE. SECURITY DEFINER, tablo RLS'ini BYPASS eder; dolayısıyla
-- anon/authenticated bu RPC'leri PostgREST (/rest/v1/rpc/...) üzerinden çağırıp
-- ödeme webhook kuyruğunu drain/manipüle edebilirdi (sahte enqueue, kuyruk
-- boşaltma, durum değiştirme).
--
-- Uygulama kodunda 4 RPC de YALNIZ createAdminClient (service_role) ile
-- çağrılıyor (process-webhooks cron + fal webhook route) -> anon/authenticated'tan
-- EXECUTE sökmek hiçbir meşru yolu bozmaz. Idempotent (REVOKE/GRANT tekrar-güvenli).

REVOKE EXECUTE ON FUNCTION public.enqueue_webhook(jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dequeue_webhooks(integer, integer)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_webhook(bigint)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_webhook(bigint, text)                FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_webhook(jsonb, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dequeue_webhooks(integer, integer)        TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_webhook(bigint)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_webhook(bigint, text)                TO service_role;
