"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  QrCode,
  Sparkles,
  Star,
  Radio,
  Layers,
  Laptop,
  Lock,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";
import { EngineToolView } from "@/components/tools/engine-tool-view";

export default function PublicNfcWriterPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";
  const engineLocale = locale === "en" ? "en" : "tr";

  const features = [
    {
      icon: Radio,
      title: tr ? "Kurulum Yok" : "No App Needed",
      desc: tr ? "Tarayıcıdan yazar" : "Writes from the browser",
      color: "text-violet-500",
      bg: "bg-violet-50 dark:bg-violet-500/10",
    },
    {
      icon: Layers,
      title: tr ? "Seri Yazma" : "Batch Writing",
      desc: tr ? "Yüzlerce etiket, tek ayar" : "Hundreds of tags, one setup",
      color: "text-fuchsia-500",
      bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10",
    },
    {
      icon: Laptop,
      title: tr ? "Bilgisayar ↔ Telefon" : "Desktop ↔ Phone",
      desc: tr ? "QR ile içerik devri" : "Hand off over QR",
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-500/10",
    },
    {
      icon: Lock,
      title: tr ? "Kalıcı Kilit" : "Permanent Lock",
      desc: tr ? "Kopyalanamaz hale getirin" : "Make tags read-only",
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
  ];
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <EngineToolView
          locale={engineLocale}
          page="nfc"
          label={tr ? "NFC etiket çalışma alanı" : "NFC tag workspace"}
        />
        {/* Feature Cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:mb-12 sm:grid-cols-4 sm:gap-4">
          {features.map((f, i) => (
            <div key={i} className="group rounded-xl border border-border/60 bg-card p-3 text-center transition-all duration-300 hover:border-violet-200 hover:shadow-lg dark:hover:border-violet-800 sm:rounded-2xl sm:p-5">
              <div className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-lg ${f.bg} transition-transform group-hover:scale-110 sm:mb-3 sm:size-12 sm:rounded-xl`}>
                <f.icon className={`size-5 ${f.color} sm:size-6`} />
              </div>
              <h3 className="text-xs font-bold sm:text-sm">{f.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Cross-link to QR */}
        <div className="mb-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:flex-row sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
              <QrCode className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">{tr ? "iPhone kullanıcıları için QR kod" : "QR codes for iPhone users"}</p>
              <p className="text-xs text-muted-foreground">
                {tr
                  ? "Aynı içeriği QR kod olarak da üretin — ücretsiz."
                  : "Generate the same content as a QR code — free."}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="w-full gap-2 sm:w-auto">
            <Link href={`/${locale}/araclar/qr-kod`}>
              {tr ? "QR Kod Oluştur" : "Create QR Code"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Upsell CTA */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-6 text-center text-white shadow-xl shadow-violet-200/30 dark:shadow-violet-900/20 sm:rounded-3xl sm:p-12">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <Star className="size-4 text-amber-300" fill="currentColor" />
              {tr ? "NFC Kartınızın Tasarımı" : "Design for Your NFC Card"}
            </div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              {tr ? "Etiketi yazdınız, ya kartın yüzü?" : "Tag written — now the card itself"}
            </h2>
            <p className="mt-3 text-white/80">
              {tr
                ? "Kartvizit görseli, logo tasarımı, ürün fotoğrafı ve 12+ AI aracı. 50 ücretsiz kredi ile başlayın."
                : "Card artwork, logo design, product photos and 12+ AI tools. Start with 50 free credits."}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="gap-2 bg-white font-bold text-violet-700 shadow-lg transition-all hover:bg-white/90">
                <Link href={`/${locale}/login`}>
                  {tr ? "Ücretsiz Kayıt Ol — 50 Kredi Hediye" : "Sign Up Free — 50 Credits Gift"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <div className="flex items-center gap-1.5 text-sm text-white/70">
                <CheckCircle2 className="size-4" />
                {tr ? "Kredi kartı gerekmez" : "No credit card required"}
              </div>
            </div>
          </div>
        </div>

        {/* SEO Content */}
        <div className="mb-12 space-y-6 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <div>
            <h2 className="text-xl font-bold">
              {tr ? "NFC etiket nasıl programlanır?" : "How do you program an NFC tag?"}
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "NFC (Near Field Communication), telefonu bir etikete birkaç santimetre yaklaştırdığınızda veri aktaran kablosuz teknolojidir. Etikete yazılan veri NDEF adı verilen standart bir biçimde saklanır; bu sayfa telefonunuzun tarayıcısındaki Web NFC arayüzünü kullanarak bu NDEF mesajını doğrudan etikete yazar — aracı bir uygulama yoktur."
                  : "NFC (Near Field Communication) moves data when you hold a phone a few centimetres from a tag. What gets written is a standard NDEF message, and this page writes that message straight to the tag through your phone browser's Web NFC interface — no intermediary app."}
              </p>
              <p>
                {tr
                  ? "İçerik tipini seçin, alanları doldurun, \"Etikete Yaz\" düğmesine dokunun ve telefonu etikete değdirin. Yazma işlemi bir saniyeden kısa sürer. Seri yazma modunda ayarları bir kez yapar, etiketleri sırayla değdirerek yüzlercesini programlarsınız."
                  : "Pick a content type, fill the fields, tap \"Write to Tag\" and touch the tag with your phone. The write takes under a second. Batch mode configures once and programs hundreds of tags as you present them one by one."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Hangi telefonlar NFC etiketine yazabilir?" : "Which phones can write NFC tags?"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Yazma işlemi Web NFC gerektirir: NFC donanımı olan Android telefonlarda Chrome 89 ve üzeri (Edge dahil). iPhone'lar NFC etiketlerini okuyabilir ancak Safari Web NFC'yi desteklemediği için tarayıcıdan yazamaz. Masaüstü bilgisayarlarda NFC anteni bulunmaz."
                  : "Writing needs Web NFC: Chrome 89+ (and Edge) on Android phones with NFC hardware. iPhones can read NFC tags, but Safari does not support Web NFC, so they cannot write from the browser. Desktop machines have no NFC antenna."}
              </p>
              <p>
                {tr
                  ? "Sayfa HTTPS üzerinden çalışır ve NFC izni ilk yazma denemesinde sorulur. Telefon ayarlarından NFC kapalıysa tarayıcı hata döndürür."
                  : "The page runs over HTTPS and asks for NFC permission on your first write. If NFC is off in system settings, the browser returns an error."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr
                ? "Bilgisayarda hazırlayıp telefonda yazmak"
                : "Prepare on a computer, write from the phone"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Uzun bir kartvizit veya adresi telefon klavyesinde yazmak zahmetlidir. Bilgisayarda formu doldurun, \"Bağlantı Oluştur\" düğmesiyle çıkan QR kodu telefonunuzun kamerasıyla okutun: sayfa telefonda aynı içerikle dolu açılır ve tek dokunuşla etikete yazarsınız."
                  : "Typing a long contact card on a phone keyboard is a chore. Fill the form on your computer, tap \"Create Link\" and scan the QR with your phone camera: the page opens there already filled in, one tap from writing the tag."}
              </p>
              <p>
                {tr
                  ? "Ters yönü de çalışır: telefonda \"Etiketi Oku\" ile mevcut bir etiketi okuyun, \"Forma yükle ve düzenle\" deyin, çıkan bağlantıyı kendinize gönderin ve bilgisayarda düzenlemeye devam edin. İçerik bağlantının # işaretinden sonraki kısmında taşınır; tarayıcı bu kısmı sunucuya göndermez, dolayısıyla WiFi şifreniz veya iletişim bilgileriniz sunucu kayıtlarına düşmez."
                  : "It works the other way too: read an existing tag on your phone, tap \"Load into the form\", send yourself the link and keep editing on the computer. The content travels after the # in the link, which browsers never send to the server, so your Wi-Fi password or contact details stay out of server logs."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Hangi etiketi almalıyım? (NTAG213 / 215 / 216)" : "Which tag should I buy? (NTAG213 / 215 / 216)"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Etiketlerin kapasitesi farklıdır: NTAG213 132 bayt, NTAG215 492 bayt, NTAG216 872 bayt NDEF mesajı alır. Kısa bir bağlantı için NTAG213 fazlasıyla yeter; fotoğraflı olmayan bir dijital kartvizit (vCard) genellikle NTAG215 ister. Yukarıdaki boyut göstergesi, girdiğiniz içeriğin hangi etiketlere sığdığını yazarken canlı gösterir."
                  : "Capacities differ: NTAG213 holds a 132-byte NDEF message, NTAG215 492 bytes, NTAG216 872 bytes. A short link fits an NTAG213 easily; a digital business card (vCard) usually wants an NTAG215. The size meter above shows live which tags your content still fits."}
              </p>
              <p>
                {tr
                  ? "Metale yapıştırılacak etiketlerde \"on-metal\" (metale uygun) sürümü seçin — düz etiketler metal yüzeyde okunmaz."
                  : "For metal surfaces choose an \"on-metal\" tag — plain stickers will not read on metal."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Etiketi kilitlemek ne yapar?" : "What does locking a tag do?"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Kilitleme, etiketi kalıcı olarak salt-okunur yapar: içerik bir daha değiştirilemez, silinemez. Müşteriye teslim edilen veya halka açık yere yapıştırılan etiketlerde içeriğin değiştirilmesini önler. İşlem geri alınamaz — kilitlemeden önce etiketi okuyup doğruladığınızdan emin olun."
                  : "Locking makes the tag permanently read-only: the content can never be changed or erased again. It protects tags handed to customers or stuck in public places from being rewritten. It cannot be undone — read the tag back and verify it before you lock."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Verilerim nereye gidiyor?" : "Where does my data go?"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Hiçbir yere. Girdiğiniz bilgiler tarayıcınızda NDEF mesajına dönüştürülüp doğrudan etikete yazılır; Renderhane sunucularına gönderilmez, kaydedilmez. Kayıt da gerekmez."
                  : "Nowhere. What you type is turned into an NDEF message in your browser and written straight to the tag; it is never sent to or stored on Renderhane servers. No sign-up required either."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <Box className="size-4" /> Renderhane
          </Link>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3" />
            {tr
              ? "AI destekli görsel üretim platformu — E-ticaret, Oyun, 3D Baskı"
              : "AI-powered visual production platform — E-commerce, Gaming, 3D Printing"}
          </p>
        </div>
      </footer>
    </div>
  );
}
