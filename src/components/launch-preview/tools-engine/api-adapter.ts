import type { ImageResult, RenderhaneAdapters } from './core';

function fileAsDataUrl(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new DOMException('İptal edildi.', 'AbortError')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onloadend = () => signal.removeEventListener('abort', abort);
    reader.readAsDataURL(file);
  });
}
/**
 * Contract retained from the earlier review of turer73/renderhane; revalidate before production:
 * POST /api/demo/bg-remove, body {imageDataUrl}; result {resultUrl, remaining}.
 * Same-origin only; no provider credentials may be placed in client code.
 * Real requests are not automatically retried: a retry could consume another credit.
 */
export function createRenderhaneAdapter(locale: 'tr' | 'en' = 'tr'): RenderhaneAdapters {
  const message = (tr: string, en: string): string => locale === 'en' ? en : tr;
  return {
    async removeBackground(file: File, signal: AbortSignal): Promise<ImageResult> {
      if (file.size > 5 * 1024 * 1024) throw new Error(message('Dosya 5 MB sınırını aşıyor.', 'The file exceeds the 5 MB limit.'));
      const imageDataUrl = await fileAsDataUrl(file, signal);
      const response = await fetch('/api/demo/bg-remove', {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl }),
      });
      let body: { resultUrl?: unknown; remaining?: unknown; errorTr?: unknown; error?: unknown };
      try { body = await response.json(); }
      catch { throw new Error(message('Sunucudan geçersiz yanıt geldi.', 'The server returned an invalid response.')); }
      if (!response.ok) {
        const serverMessage = locale === 'en'
          ? (typeof body.error === 'string' ? body.error : '')
          : (typeof body.errorTr === 'string' ? body.errorTr : typeof body.error === 'string' ? body.error : '');
        throw new Error(serverMessage || (response.status === 429
          ? message('Günlük ücretsiz kullanım sınırına ulaşıldı.', 'The daily free-use limit has been reached.')
          : message('İşlem tamamlanamadı.', 'The operation could not be completed.')));
      }
      if (typeof body.resultUrl !== 'string' || !body.resultUrl) throw new Error(message('API görsel adresi döndürmedi.', 'The API did not return an image URL.'));
      return { url: body.resultUrl, remaining: typeof body.remaining === 'number' ? body.remaining : undefined };
    },
    // generateScenes is intentionally not fabricated: attach the existing job/polling
    // flow here after checking its live endpoint, credit handling and output schema.
  };
}
