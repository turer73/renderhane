import {IDEA_SOURCES, getInspirationIdea, getInspirationIdeas, ideaEscape} from "./inspiration";
import type {IdeaCategory, IdeaChannel, IdeaReadiness, InspirationIdea, InspirationState} from "./inspiration";

const COPY: Array<[string, string]> = [
  ["ANA SAYFA", "HOME"],
  ["ARAÇLAR", "TOOLS"],
  ["Arka plan kaldır", "Remove background"],
  ["QR kod oluştur", "Create QR code"],
  ["NFC etiket yaz", "Write NFC tag"],
  ["Üretim alanı sade.", "A focused workspace."],
  ["Dosyanız, ayarlarınız ve sonuç aynı yerde.", "Your file, settings, and result stay together."],
  ["Arka planı ", "Leave the background "],
  ["geride bırak.", "behind."],
  ["Ürün fotoğrafını yükle. Sade bir çalışma alanında incele, arka planını düzenle ve çıktını indir.", "Upload a product photo, review it in a focused workspace, adjust the background, and download the result."],
  ["Kayıt olmadan", "No signup"],
  ["Günde 3 ücretsiz kullanım", "3 free uses per day"],
  ["Şeffaf PNG", "Transparent PNG"],
  ["Kendi fotoğrafınla başla", "Start with your own photo"],
  ["Fotoğraf seç", "Choose photo"],
  ["Fotoğraf ve çıktı", "Photo and output"],
  ["API bağlı", "API connected"],
  ["Fotoğrafı değiştir", "Change photo"],
  ["Fotoğrafını buraya bırak", "Drop your photo here"],
  ["veya dosya seç", "or choose a file"],
  ["en fazla 5 MB", "up to 5 MB"],
  ["Ürün fotoğrafı seç", "Choose a product photo"],
  ["Çıktı biçimi", "Output format"],
  ["Boyut", "Size"],
  ["Kaynak boyutu", "Original size"],
  ["Arka plan", "Background"],
  ["PNG önizlemesi", "PNG preview"],
  ["Şeffaf arka plan", "Transparent background"],
  ["İşleniyor…", "Processing…"],
  ["Arka planı kaldır", "Remove background"],
  ["AI bağlantısını kontrol et", "Check AI connection"],
  ["Örnek sonucu göster", "Show sample result"],
  ["PNG indir", "Download PNG"],
  ["Örnek PNG indir", "Download sample PNG"],
  ["yerel dosya", "local file"],
  ["temsili şişe örneği", "sample bottle image"],
  ["Fotoğraf yüklemek üretim işlemi başlatmaz.", "Uploading a photo does not start a generation job."],
  ["Kalan hak:", "Uses remaining:"],
  ["İşlem düğmesine basıldığında fotoğraf mevcut API’ye gönderilir.", "Your photo is sent to the connected API only after you press the action button."],
  ["Demo, yalnızca hazır örneğin dekupe sonucunu içerir. Kendi fotoğrafın için mevcut AI API’sini bağlamak gerekir.", "The demo contains only the prepared sample cutout. Processing your own photo requires the connected AI API."],
  ["Gerçek fotoğrafla başla", "Start with a real photo"],
  ["Örnek yerine kendi ürün fotoğrafını da yükleyebilirsin.", "You can upload your own product photo instead of using the sample."],
  ["Sonucu karşılaştır", "Compare the result"],
  ["Kaydırıcıyla kenarları ve detayları incele.", "Use the slider to inspect edges and details."],
  ["PNG olarak indir", "Download as PNG"],
  ["Saydam veya seçtiğin düz zeminle dışa aktar.", "Export with transparency or your selected solid background."],
  ["İşlemler görünür", "Clear processing states"],
  ["Demo çıktısı ve gerçek API çıktısı ayrı etiketlenir.", "Demo output and real API output are labelled separately."],
  ["Yüklenen fotoğraf", "Uploaded photo"],
  ["Yerel önizleme", "Local preview"],
  ["Yüklediğiniz fotoğraf", "Your uploaded photo"],
  ["Henüz AI işlemi uygulanmadı.", "No AI processing has been applied yet."],
  ["Hazır örneğe dön", "Return to sample"],
  ["Onaylı şişe örneği", "Approved bottle sample"],
  ["Görünüm", "View"],
  ["Karşılaştır", "Compare"],
  ["Orijinal", "Original"],
  ["Sonuç", "Result"],
  ["Arka plan kaldırılmış sonuç", "Background-removed result"],
  ["Önceden hazırlanmış örnek dekupe", "Prepared sample cutout"],
  ["Hazır örnek çıktı", "Prepared sample output"],
  ["Önce ve sonra karşılaştırması", "Before and after comparison"],
  ["Ayrıntıları karşılaştır", "Compare details"],
  ["API tarafından döndürülen çıktı", "Output returned by the API"],
  ["Temsili şişe görseli · Hazır dekupe", "Sample bottle image · Prepared cutout"],
  ["SONRAKİ ADIM · ÜCRETSİZ + ÜYELİKLİ", "NEXT STEP · FREE + MEMBER ACCESS"],
  ["Kendi sahneni kur.", "Build your own scene."],
  ["Kendi arka planını yükle; ürününü sürükle, boyutlandır ve döndür. Manuel yerleştirme ücretsizdir; indirmek için üyelik gerekir. AI ile sahne üretimi ayrı ve kredilidir.", "Upload your own background, then drag, resize, and rotate your product. Manual placement is free; downloading requires membership. AI scene generation is separate and uses credits."],
  ["Sahneye yerleştir", "Place in scene"],
  ["Senin stilin.", "Your style."],
  ["Önce okunabilirlik.", "Readability first."],
  ["İçeriğini gir, hazır şeklini seç. QR yapısı korunur; her değişiklikte dijital veri kontrolü yeniden çalışır.", "Enter your content and choose a preset shape. The QR structure stays protected and the digital data check reruns after every change."],
  ["Ücretsiz · Kayıt yok", "Free · No signup"],
  ["Hazır vektörel şekiller", "Vector shape presets"],
  ["Kontrollü PNG + SVG", "Verified PNG + SVG"],
  ["İçeriğini seç", "Choose your content"],
  ["Hazır şeklini seç", "Choose a preset shape"],
  ["QR modül şekli", "QR module shape"],
  ["Şekil yalnız veri alanına uygulanır. İşaret köşe, hizalama, zamanlama ve bilgi alanları kare olarak korunur.", "The shape applies only to data modules. Finder, alignment, timing, and information areas remain square."],
  ["Renk ve çıktı boyutu", "Color and output size"],
  ["Koyu QR rengi", "Dark QR color"],
  ["Çıktı boyutu", "Output size"],
  ["Yapısal alanlar kilitli.", "Structural areas are locked."],
  ["Beyaz zemin, dört modüllük boş kenar ve H hata düzeltmesi korunur. Logo örtüşmesi, şeffaf zemin ve serbest çizim bu sürümde yok.", "The white background, four-module quiet zone, and H error correction are preserved. Logo overlays, transparent backgrounds, and freehand shapes are not available in this version."],
  ["QR önizlemesi", "QR preview"],
  ["Çıktı hazırlanıyor.", "Preparing output."],
  ["Kontrol bekleniyor", "Waiting for verification"],
  ["Geçerli içerik ve okunabilir bir çıktı hazırlanmalı.", "Valid content and a readable output are required."],
  ["SVG indir", "Download SVG"],
  ["Test geçmeden indirme açılmaz. Baskıdan önce son boyutta telefonla tara.", "Downloads remain disabled until verification passes. Scan at final print size with a phone before production."],
  ["Dijital kontrol neyi doğruluyor?", "What does the digital check verify?"],
  ["SVG görüntüsünün ve indirilecek PNG&apos;nin bilinen ızgarasından veri okunur; biçim, yönlendirme alanları, hata kontrolü ve içerik eşleşmesi sınanır. Nihai boyut, 6 piksel/modül ve hafif bulanıklıkta toplam 9 kontrol yapılır.", "Data is read from the known grid of the SVG and downloadable PNG. Format, finder areas, error correction, and payload matching are checked across 9 tests at final size, 6 pixels per module, and slight blur."],
  ["Bu işlem, kamerayla QR bulma testi veya her telefonda okuma garantisi değildir. Hazır stil örnekleri geliştirme testlerinde OpenCV ve ZBar ile ayrıca okunur. Üretim baskısını gerçek cihazda kontrol et.", "This is not a camera-detection test or a guarantee for every phone. Preset styles are also checked with OpenCV and ZBar during development. Test the production print on real devices."],
  ["QR içeriği", "QR content"],
  ["Okunabilirlik önce gelir", "Readability comes first"],
  ["Yapısal alanlar değişmez; hatalı sonuç indirmeye açılmaz.", "Structural areas stay intact and invalid output cannot be downloaded."],
  ["Gerçek vektörel çıktı", "True vector output"],
  ["Şekiller SVG yollarıdır; PNG aynı görüntüden üretilir.", "Shapes are SVG paths and the PNG is rendered from the same image."],
  ["AI kredisi harcamaz", "Uses no AI credits"],
  ["Hazır şekiller ve kontroller tarayıcıda çalışır.", "Preset shapes and checks run in your browser."],
  ["Son baskıyı test et", "Test the final print"],
  ["Malzeme, boyut ve telefon sonucu etkileyebilir.", "Material, size, and phone can affect the result."],
  ["Web adresi", "Web address"],
  ["https:// ile başlayan bağlantını gir.", "Enter a link beginning with https://."],
  ["Ad soyad *", "Full name *"],
  ["Adınız Soyadınız", "Your full name"],
  ["Telefon", "Phone"],
  ["E-posta", "Email"],
  ["Kurum / marka", "Organization / brand"],
  ["Marka adı", "Brand name"],
  ["Web sitesi", "Website"],
  ["Ağ adı (SSID) *", "Network name (SSID) *"],
  ["Misafir ağı", "Guest network"],
  ["Ağ şifresi", "Network password"],
  ["Paylaşılacak WiFi şifresi", "WiFi password to share"],
  ["Şifreleme", "Encryption"],
  ["Şifresiz ağ", "Open network"],
  ["QR, ağ şifresini içerir. Yalnızca paylaşmak istediğin bir misafir ağını kullan.", "The QR contains the network password. Use only a guest network you intend to share."],
  ["WiFi için özel WSC/NDEF kodlaması gerekir. Bu bağımsız sürümde WiFi yazımı kapalıdır; QR aracını kullanabilirsin.", "WiFi requires WSC/NDEF encoding. WiFi writing is disabled in this standalone version; use the QR tool instead."],
  ["Telefon numarası *", "Phone number *"],
  ["E-posta adresi *", "Email address *"],
  ["Konu", "Subject"],
  ["Merhaba", "Hello"],
  ["Mesaj", "Message"],
  ["Enlem *", "Latitude *"],
  ["Boylam *", "Longitude *"],
  ["Ondalık ayırıcı olarak nokta kullan.", "Use a period as the decimal separator."],
  ["Metin *", "Text *"],
  ["Android paket adı *", "Android package name *"],
  ["Google Play bağlantısı ve Android uygulama kaydı yazılır.", "Writes a Google Play link and Android application record."],
  ["Klasik", "Classic"],
  ["Tam kare", "Full square"],
  ["Yumuşak", "Rounded"],
  ["Yuvarlak köşe", "Soft corners"],
  ["Nokta", "Dots"],
  ["Dolu daire", "Filled circles"],
  ["Elmas", "Diamond"],
  ["Dolu baklava", "Filled diamonds"],
  ["Yıldız", "Star"],
  ["Kalın merkez", "Bold center"],
  ["SANATSAL QR", "ARTISTIC QR"],
  ["ÜCRETLİ ÖZEL TASARIM", "PAID CUSTOM DESIGN"],
  ["Sadece bir kod değil.", "More than a code."],
  ["Markanın bir parçası.", "Part of your brand."],
  ["Ambalajında, kartvizitinde ya da vitrinde. Bağlantını, markanın görsel dünyasıyla buluşturan bir tasarım yaklaşımı.", "For packaging, business cards, or displays. A design approach that connects your link with your brand's visual world."],
  ["Sanatsal QR’ı keşfet", "Explore artistic QR"],
  ["Standart QR ücretsiz", "Standard QR is free"],
  ["Ücretsiz QR aracından ayrı sunulur. Görselin taranabilirliği doğrulanmadı.", "Offered separately from the free QR tool. The sample image has not been verified for scanability."],
  ["Sanatsal QR özel tasarım örneğini incele", "View the artistic QR custom design sample"],
  ["Paylaştığınız altın, mor ve turkuaz çiçek desenli sanatsal QR örneği", "Artistic QR sample with gold, purple, and turquoise floral patterns"],
  ["ÇİÇEK & ORNAMENT", "FLORAL & ORNAMENT"],
  ["#ffffff arka plan", "#ffffff background"],
  ["#eee9e2 arka plan", "#eee9e2 background"],
  ["#e9e4f6 arka plan", "#e9e4f6 background"],
  ["#dce8df arka plan", "#dce8df background"],
  ["#202832 arka plan", "#202832 background"],
  ["Özel tasarım örneği", "Custom design sample"],
  ["Bir dokunuşla ", "Connect with "],
  ["bağlantı kur.", "one tap."],
  ["NFC etiketine web adresi veya iletişim bilgisi yaz. Önce içeriği hazırla, sonra uyumlu telefonla etikete aktar.", "Write a web address or contact details to an NFC tag. Prepare the content first, then transfer it with a compatible phone."],
  ["Uygulama kurmadan", "No app installation"],
  ["Uyumlu Android + Chrome", "Compatible Android + Chrome"],
  ["Fiziksel etiket gerekir", "Physical tag required"],
  ["İçerik türünü seç", "Choose content type"],
  ["İçeriğini hazırla", "Prepare your content"],
  ["Etiketteki mevcut içeriğin üzerine yazılmasına izin ver.", "Allow overwriting the tag's existing content."],
  ["Etikete yaz", "Write to tag"],
  ["Etiketi oku", "Read tag"],
  ["İçeriği kopyala", "Copy content"],
  ["Durdur", "Stop"],
  ["Tarayıcı Web NFC sunuyor. Gerçek donanım ve etiket uygunluğu işlem sırasında doğrulanır.", "This browser provides Web NFC. Hardware and tag compatibility are verified during the operation."],
  ["Bu tarayıcıda NFC yazma kullanılamıyor. İçeriği hazırlayabilirsin; yazmak için HTTPS üzerinden NFC destekli Android telefonda Chrome ile aç.", "NFC writing is unavailable in this browser. You can prepare the content here; to write it, open this HTTPS page in Chrome on an NFC-enabled Android phone."],
  ["Bu sürümde kalıcı kilitleme ve toplu yazım yoktur. WiFi/WSC yazımı için mevcut projedeki NDEF modülü kullanılmalıdır.", "This version does not provide permanent locking or bulk writing. WiFi/WSC writing requires the project's dedicated NDEF module."],
  ["Temsili Android önizlemesi", "Illustrative Android preview"],
  ["Dokun, bağlantı kur.", "Tap to connect."],
  ["İçeriğini hazırlamaya başla.", "Start preparing your content."],
  ["Temsili telefon önizlemesi", "Illustrative phone preview"],
  ["Renderhane etiket tasarım örneği", "Renderhane tag design sample"],
  ["Tarayıcı desteği var", "Browser support detected"],
  ["Önce cihaz uyumluluğu", "Check device compatibility"],
  ["Yazmak için etiketi telefona yaklaştır.", "Hold the tag near the phone to write."],
  ["NFC donanımı, Chrome ve HTTPS gerekir.", "NFC hardware, Chrome, and HTTPS are required."],
  ["Web NFC ve cihaz NFC donanımı gerekli. İşlem için izin istenir.", "Web NFC and device NFC hardware are required. The browser will ask for permission."],
  ["iPhone tarayıcısı", "iPhone browser"],
  ["Buradan etikete yazma sunulmaz. Etiket okuma cihaz ve içerikle değişir.", "Tag writing is not available here. Reading behavior depends on the device and content."],
  ["İçeriği açıkça gör", "Review content clearly"],
  ["Yazmadan önce bağlantıyı ve iletişim bilgilerini kontrol et.", "Check the link and contact details before writing."],
  ["İzin senin kontrolünde", "You control permission"],
  ["Üzerine yazma seçeneği varsayılan olarak kapalıdır.", "Overwrite is off by default."],
  ["Cihazı önce kontrol et", "Check the device first"],
  ["Tarayıcı desteği, fiziksel donanım garantisi değildir.", "Browser support does not guarantee compatible hardware."],
  ["Gerçek donanım bağlantısı", "Real hardware interaction"],
  ["Yazma başarı mesajı ancak cihaz onayından sonra gelir.", "A success message appears only after the device confirms the write."],
  ["QR içerik türü", "QR content type"],
  ["NFC içerik türü", "NFC content type"],
  ["Yeniden kontrol ediliyor", "Rechecking"],
  ["Girdi değişti. Önceki onay artık geçerli değil.", "The input changed. The previous verification is no longer valid."],
  ["Dijital veri kontrolü sürüyor", "Digital data check in progress"],
  ["SVG görüntüleniyor; QR verisi ve hata kontrolü sınanıyor.", "The SVG is visible while QR payload and error correction are checked."],
  ["Dijital veri kontrolü geçti", "Digital data check passed"],
  ["Klasik karşılaştırma da geçti", "Classic baseline also passed"],
  ["Klasik QR", "Classic QR"],
  ["kontrol · İçerik birebir eşleşti", "checks · Exact payload match"],
  ["İndirme kapalı", "Download disabled"],
  ["QR doğrulanamadı.", "QR verification failed."],
  ["Güncel çıktının kontrolleri tamamlanmadan indirme yapılamaz.", "You cannot download until the current output has passed verification."],
  ["WiFi QR kodu ağ adını ve şifresini içerir. Şifre bu önizlemede gizlendi.", "The WiFi QR code contains the network name and password. The password is hidden in this preview."],
  ["Hazır örnek çıktı gösteriliyor. Bu işlem AI çağrısı değildir.", "Showing the prepared sample output. This is not an AI request."],
  ["Fotoğraf önizleniyor. Gerçek işlem için removeBackground API adaptörünü bağla.", "The photo is being previewed. Connect the removeBackground API adapter for real processing."],
  ["İşlem tamamlandı. Sonucu kontrol ederek indir.", "Processing completed. Review the result before downloading."],
  ["İşlem başarısız oldu.", "Processing failed."],
  ["Fotoğraf yalnızca bu tarayıcıya yüklendi.", "The photo was loaded only in this browser."],
  ["Yalnızca JPG, PNG veya WebP yükleyin.", "Upload only JPG, PNG, or WebP files."],
  ["Dosya 5 MB sınırını aşıyor.", "The file exceeds the 5 MB limit."],
  ["Görsel çok büyük: en fazla 24 megapiksel.", "The image is too large: maximum 24 megapixels."],
  ["Dosya açılamadı.", "The file could not be opened."],
  ["Görsel açılamadı.", "The image could not be opened."],
  ["Görsel dışa aktarılamadı.", "The image could not be exported."],
  ["Çıktı indirilemedi. Sunucu CORS ve indirme izinlerini kontrol edin.", "The output could not be downloaded. Check the server's CORS and download permissions."],
  ["Canvas desteklenmiyor.", "Canvas is not supported."],
  ["İndirme başarısız.", "Download failed."],
  ["Web adresini girin.", "Enter a web address."],
  ["http:// veya https:// ile başlayan geçerli bir adres girin.", "Enter a valid address beginning with http:// or https://."],
  ["Yalnızca kimlik bilgisi içermeyen HTTP/HTTPS adresleri destekleniyor.", "Only HTTP/HTTPS addresses without embedded credentials are supported."],
  ["Telefon alanını doldurun.", "Complete the phone field."],
  ["Telefon numarasını ülke koduyla girin.", "Enter the phone number with its country code."],
  ["Ad soyad alanını doldurun.", "Complete the full name field."],
  ["Ağ adı alanını doldurun.", "Complete the network name field."],
  ["Geçersiz şifreleme seçeneği.", "Invalid encryption option."],
  ["WiFi şifresini girin.", "Enter the WiFi password."],
  ["E-posta alanını doldurun.", "Complete the email field."],
  ["Geçerli bir e-posta adresi girin.", "Enter a valid email address."],
  ["Enlem alanını doldurun.", "Complete the latitude field."],
  ["Boylam alanını doldurun.", "Complete the longitude field."],
  ["Enlem −90…90, boylam −180…180 aralığında olmalı.", "Latitude must be −90…90 and longitude −180…180."],
  ["Paket adı alanını doldurun.", "Complete the package name field."],
  ["Geçerli bir Android paket adı girin (ör. com.firma.uygulama).", "Enter a valid Android package name (for example com.company.app)."],
  ["Metin alanını doldurun.", "Complete the text field."],
  ["Bilinmeyen QR şekli.", "Unknown QR shape."],
  ["İçerik boş olamaz; en fazla 1200 UTF-8 bayt kullanın.", "Content cannot be empty; use at most 1200 UTF-8 bytes."],
  ["Çıktı boyutu 256–2048 piksel olmalı.", "Output size must be between 256 and 2048 pixels."],
  ["Daha koyu bir renk seçin. Bu sürümün renk kuralı beyaz zeminde en az 7:1 kontrasttır.", "Choose a darker color. This version requires at least 7:1 contrast on white."],
  ["NFC destekli Android, Chrome ve HTTPS gerekir.", "An NFC-enabled Android device, Chrome, and HTTPS are required."],
  ["WiFi/WSC yazımı bu sürümde kapalı.", "WiFi/WSC writing is disabled in this version."],
  ["İçeriği kontrol edin.", "Check the content."],
  ["Etiketi telefonun arkasına yaklaştır. Yazma tamamlanana kadar uzaklaştırma.", "Hold the tag near the back of the phone until writing finishes."],
  ["Okumak istediğin etiketi yaklaştır.", "Hold the tag you want to read near the phone."],
  ["20 saniye içinde etiket algılanmadı. İşlemi yeniden başlatabilirsin.", "No tag was detected within 20 seconds. You can start the operation again."],
  ["Etiket yazıldı. Kullanacağın cihazla okuyarak test et.", "Tag written. Read it with the intended device to test it."],
  ["Etiket okundu:", "Tag read:"],
  ["ikili veri", "binary data"],
  ["Etiket okunamadı. Biçim veya yakınlığı kontrol et.", "The tag could not be read. Check its format and distance."],
  ["Bilinmeyen hata", "Unknown error"],
  ["NFC izni verilmedi. İzinleri kontrol ederek tekrar dene.", "NFC permission was denied. Check permissions and try again."],
  ["Cihaz veya etiket bu işlemi desteklemiyor.", "The device or tag does not support this operation."],
  ["NFC işlemi tamamlanmadı:", "NFC operation did not complete:"],
  ["Panoya erişim için HTTPS veya localhost gerekir.", "Clipboard access requires HTTPS or localhost."],
  ["WiFi şifresini kopyalamak yerine QR aracını kullan.", "Use the QR tool instead of copying a WiFi password."],
  ["İçerik panoya kopyalandı.", "Content copied to the clipboard."],
  ["Kopyalama için HTTPS veya localhost gerekir.", "Copying requires HTTPS or localhost."],
  ["İşlem durduruldu.", "Operation stopped."],
  ["Bağlantı hazırlandı. Etikete henüz yazılmadı.", "The link is ready. It has not been written to a tag."],
  ["Bağlantı aktarıldı. Yeni QR kontrol ediliyor.", "Link applied. The new QR code is being verified."],
  ["Bağlantı aktarıldı. Yazma için ayrıca etiket ve onay gerekir.", "Link applied. Writing still requires a tag and confirmation."],
  ["Sayfa arka plana geçtiği için NFC işlemi durduruldu.", "The NFC operation stopped because the page moved to the background."],
];

const DYNAMIC: Array<[RegExp, string]> = [
  [/^([0-9]+) × ([0-9]+) px · ([0-9]+) × ([0-9]+) modül · H · 4 modül kenar$/, "$1 × $2 px · $3 × $4 modules · H · 4-module quiet zone"],
  [/^([0-9]+)[/]([0-9]+) kontrol · İçerik birebir eşleşti · Klasik QR$/, "$1/$2 checks · Exact payload match · Classic QR"],
  [/^([0-9]+)[/]([0-9]+) kontrol · İçerik birebir eşleşti · Klasik karşılaştırma da geçti$/, "$1/$2 checks · Exact payload match · Classic baseline also passed"],
];

export function localizeToolText(value: string): string {
  let result = value;
  for (const [source, target] of [...COPY].sort((a, b) => b[0].length - a[0].length)) result = result.replaceAll(source, target);
  for (const [pattern, replacement] of DYNAMIC) result = result.replace(pattern, replacement);
  return result;
}

export function localizeToolMarkup(markup: string): string {
  return localizeToolText(markup);
}

export function localizeToolElement(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, doc.defaultView?.NodeFilter.SHOW_TEXT ?? 4);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('[translate="no"]') || parent.closest("textarea,script,style")) continue;
    node.nodeValue = localizeToolText(node.nodeValue ?? "");
  }
  root.querySelectorAll<HTMLElement>("[placeholder],[aria-label],[title],[alt]").forEach(element => {
    for (const name of ["placeholder", "aria-label", "title", "alt"]) {
      const value = element.getAttribute(name);
      if (value) element.setAttribute(name, localizeToolText(value));
    }
  });
  root.querySelectorAll<HTMLInputElement>("input[readonly]").forEach(input => {
    input.value = localizeToolText(input.value);
  });
}

const EN_CATEGORIES: Record<IdeaCategory, string> = {
  product: "Products & 3D", gift: "Gifts & memories", learning: "Culture & learning",
  play: "Play & participation", business: "Business & daily life", automation: "Automation",
};

const EN_READINESS: Record<IdeaReadiness, string> = {
  link: "Ready when your link is ready", service: "Requires an additional service",
  setup: "Requires setup in an app", hardware: "Requires dedicated hardware",
};

const EN_IDEAS: Record<string, [string, string]> = {
  "talking-souvenir": ["A souvenir that tells its story", "Turn a keepsake into a one-minute journey."],
  "product-360": ["A 3D experience from the box", "See the product and rotate the model."],
  "maker-story": ["A product that introduces its maker", "Put the production story on the label."],
  "repair-guide": ["A repairable product label", "Connect the right guide and replacement parts."],
  "tactile-learning": ["Touch, listen, and learn", "Pair tactile design with accessible narration."],
  "memory-gift": ["A photo gift with a voice", "Add a personal recording to a printed memory."],
  "playlist-object": ["A physical playlist", "Turn an album collection into tabletop objects."],
  "recipe-heirloom": ["A recipe for the next generation", "Connect family recipes with familiar voices."],
  guestbook: ["From invitation to guestbook", "Let the same card live beyond the event."],
  "time-capsule": ["A time-capsule gift", "Give it today and reveal it on a chosen date."],
  "plant-pot": ["A planter with care instructions", "Give every plant its own care card."],
  scavenger: ["A story hunt through the city", "Let each stop reveal the next clue."],
  "branching-story": ["A reader who chooses the path", "Create a book with more than one ending."],
  "fan-collectible": ["A connected collectible", "Keep the story going after the purchase."],
  "exhibition-vote": ["A participatory exhibition", "Invite visitors to shape what comes next."],
  "guest-hub": ["One entry point for guests", "Put the stay guide on a single card."],
  "workshop-guide": ["The right guide at the workstation", "Keep the current instructions beside the machine."],
  portfolio: ["A portfolio you can tap", "Show the work before the business card."],
  "return-tag": ["A privacy-aware return tag", "Help the finder while keeping the owner in control."],
  feedback: ["A stand that makes feedback easier", "Ask about the real experience, not just a rating."],
  "desk-routine": ["A desktop routine button", "Use a physical object to enter work mode."],
  "music-dock": ["A 3D-printed music station", "Place a card and play it in the right room."],
  loyalty: ["Loyalty that grows with the collection", "Let each physical product unlock a new chapter."],
  "authenticated-edition": ["A verifiable limited edition", "Use a verification chain, not a decorative label."],
};

function englishIdeaCopy(idea: InspirationIdea): [string, string] {
  return EN_IDEAS[idea.id] ?? [idea.id.replaceAll("-", " "), "Explore a connected product experience."];
}

function englishIdeaSources(ids: string[]): string {
  return ids.map(id => {
    const source = IDEA_SOURCES[id];
    if (!source) return "";
    let host = "Reference";
    try { host = new URL(source.url).hostname.replace(/^www[.]/, ""); } catch { /* fallback */ }
    return '<a href="' + ideaEscape(source.url) + '" target="_blank" rel="noopener noreferrer">' + ideaEscape(host) + ' · Reference <span aria-hidden="true">↗</span></a>';
  }).join("");
}

function englishIdeaDetail(idea: InspirationIdea, channel: IdeaChannel): string {
  const copy = englishIdeaCopy(idea);
  const title = copy[0], hook = copy[1], word = channel === "qr" ? "QR" : "NFC";
  const form = idea.canApply
    ? '<form class="rh-idea-link-form" id="rh-idea-form" data-idea-id="' + ideaEscape(idea.id) + '" novalidate><div><h4>Is your link ready?</h4><p>This fills only the ' + word + ' link field. It does not create or contact the destination page.</p></div><label for="rh-idea-url">HTTPS link to use<input id="rh-idea-url" name="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="https://example.com/my-page" aria-describedby="rh-idea-url-help rh-idea-form-status" required></label><small id="rh-idea-url-help">Use a short address under your control. Do not enter private access keys.</small><label class="rh-idea-consent"><input type="checkbox" name="confirm" required><span>I confirm replacing the current ' + word + ' content with this link.</span></label><button class="rh-btn rh-btn-primary" type="submit">Apply to ' + word + ' field <span aria-hidden="true">↑</span></button><p id="rh-idea-form-status" role="status" aria-live="polite"></p><small>' + (channel === "qr" ? "Style and size stay unchanged; readability checks rerun for the new QR code." : "This does not write to a tag automatically. Overwrite consent resets and writing still requires a device action.") + '</small></form>'
    : '<div class="rh-idea-no-auto"><strong>This idea is not a one-click feature.</strong><p>Set up the required service, app, or hardware before production.</p></div>';
  return '<article class="rh-idea-detail" id="rh-idea-detail" tabindex="-1" aria-labelledby="rh-idea-detail-title"><div class="rh-idea-detail-top"><div><div class="rh-idea-meta">IMPLEMENTATION GUIDE · ' + EN_CATEGORIES[idea.category] + '</div><h3 id="rh-idea-detail-title">' + ideaEscape(title) + '</h3></div><button type="button" class="rh-idea-close" data-idea-close aria-label="Close idea details">×</button></div><p class="rh-idea-what">' + ideaEscape(hook) + ' Use a short HTTPS destination that you control, then test the complete experience on the final product.</p><div class="rh-idea-detail-grid"><div><h4>How to set it up</h4><ol><li>Prepare and publish the destination content.</li><li>Connect the same controlled link to the ' + word + ' experience.</li><li>Test the finished product on representative devices.</li></ol><div class="rh-idea-need"><strong>' + EN_READINESS[idea.readiness] + '</strong><p>Plan destination ownership, maintenance, and physical placement before production.</p></div></div><div><div class="rh-idea-caution"><strong>Important limitation</strong><p>A QR code or standard NFC tag does not host content, prove ownership, guarantee compatibility, or provide authentication by itself.</p></div><div class="rh-idea-sources"><strong>References and technical foundations</strong>' + englishIdeaSources(idea.sourceIds) + '<small>These are adaptation ideas for Renderhane; the references do not guarantee sales or outcomes.</small></div></div></div>' + form + '</article>';
}

function englishIdeaReality(channel: IdeaChannel): string {
  const title = channel === "qr" ? "Before printing: destination, trust, and readability" : "Before installation: device, material, and trust";
  return '<details class="rh-idea-reality"><summary>' + title + '</summary><div><p><strong>Keep the destination under control:</strong> The code or tag stores access information; the linked content remains on your website or service.</p><p><strong>Test the finished object:</strong> Size, material, placement, browser, phone, and network conditions can change the result.</p><p><strong>Do not overclaim:</strong> A standard code or tag is not proof of identity, ownership, location, or authenticity.</p><p><strong>Provide a fallback:</strong> Keep a readable address or QR alternative where appropriate.</p></div></details>';
}

function englishIdeaCard(idea: InspirationIdea, index: number, selectedId: string | undefined): string {
  const copy = englishIdeaCopy(idea), open = selectedId === idea.id;
  return '<article class="rh-idea-card"><div class="rh-idea-card-top"><span class="rh-idea-icon" aria-hidden="true">✦</span><span class="rh-idea-number">' + String(index + 1).padStart(2, "0") + '</span></div><span class="rh-idea-badge ' + idea.readiness + '">' + EN_READINESS[idea.readiness] + '</span><h3>' + ideaEscape(copy[0]) + '</h3><p>' + ideaEscape(copy[1]) + '</p><button class="rh-idea-open" data-idea="' + idea.id + '" aria-expanded="' + open + '" aria-controls="rh-idea-details-slot" type="button">' + (open ? "Details open" : "View idea") + ' <span aria-hidden="true">↗</span><span class="rh-idea-sr"> · ' + ideaEscape(copy[0]) + '</span></button></article>';
}

export function englishInspiration(channel: IdeaChannel, state: InspirationState = {category: "all", expanded: false, selected: null}): string {
  const all = getInspirationIdeas(channel), filtered = getInspirationIdeas(channel, state.category);
  const visible = state.expanded ? filtered : filtered.slice(0, 6);
  const selected = state.selected ? getInspirationIdea(channel, state.selected) : undefined;
  const categories = (Object.entries(EN_CATEGORIES) as Array<[IdeaCategory, string]>).filter(entry => all.some(idea => idea.category === entry[0]));
  const more = filtered.length > 6 ? '<div class="rh-idea-more-wrap"><button type="button" class="rh-btn rh-btn-outline" data-idea-more aria-expanded="' + state.expanded + '">' + (state.expanded ? "Show the first 6 ideas" : "Show " + (filtered.length - 6) + " more ideas") + ' <span aria-hidden="true">' + (state.expanded ? "−" : "+") + '</span></button></div>' : "";
  return '<section class="rh-ideas" id="rh-inspiration" aria-labelledby="rh-ideas-title"><header class="rh-ideas-header"><div><div class="rh-idea-eyebrow"><span></span> IDEAS & USE CASES</div><h2 id="rh-ideas-title">' + (channel === "qr" ? "More than<br><em>a code.</em>" : "One tap.<br><em>A new experience.</em>") + '</h2><p>Connected products, meaningful gifts, and practical experiences. Choose an idea and review what it needs.</p></div><div class="rh-idea-hero-note"><span>' + all.length + '</span><strong>' + (channel === "qr" ? "ideas available for QR" : "ideas selected for NFC") + '</strong><p>Ideas that start with a link are separated from those that need services, setup, or hardware.</p><small>Source review · September 17, 2026</small></div></header><div class="rh-idea-intro"><strong>What does this section do?</strong><span>It provides ideas and can transfer your prepared link into the tool. It does not host content or create external services.</span></div><div class="rh-idea-filters" role="group" aria-label="Idea category"><button type="button" data-idea-filter="all" aria-pressed="' + (state.category === "all") + '">All <span>' + all.length + '</span></button>' + categories.map(entry => '<button type="button" data-idea-filter="' + entry[0] + '" aria-pressed="' + (state.category === entry[0]) + '">' + entry[1] + '</button>').join("") + '</div><div class="rh-idea-count" aria-live="polite">Showing ' + visible.length + ' of ' + filtered.length + ' ideas' + (state.category === "all" ? " · Recommended starting points" : "") + '</div><div id="rh-idea-details-slot">' + (selected ? englishIdeaDetail(selected, channel) : "") + '</div><div class="rh-idea-grid">' + visible.map((idea, index) => englishIdeaCard(idea, index, selected?.id)).join("") + '</div>' + more + englishIdeaReality(channel) + '<p class="rh-idea-endnote">Research-based suggestions · QR readability checks and NFC writing safeguards remain independent from these ideas.</p></section>';
}
