import {IDEA_SOURCES, getInspirationIdea, getInspirationIdeas, ideaEscape} from "./inspiration";
import type {IdeaCategory, IdeaChannel, IdeaReadiness, InspirationIdea, InspirationState} from "./inspiration";

const COPY: Array<[string, string]> = [  ["Önce sana ait veya paylaşma iznin olan sayfanın bağlantısını gir.", "Enter a link to a page you own or have permission to share."],
  ["Daha kısa bir bağlantı kullan; en fazla 2048 karakter.", "Use a shorter link, up to 2048 characters."],
  ["Bu hazırlama akışında yalnızca geçerli HTTPS bağlantıları kabul edilir.", "Only valid HTTPS links are accepted in this setup flow."],
  ["Geçerli bir HTTPS bağlantısı gir.", "Enter a valid HTTPS link."],
  ["Kullanıcı adı veya parola içermeyen bir HTTPS adresi kullan.", "Use an HTTPS address without a username or password."],
  ["Mevcut içeriği değiştirmek için onay kutusunu işaretle.", "Select the confirmation checkbox to replace the current content."],
  ["Bu fikir yalnızca kurulum rehberidir.", "This idea is a setup guide only."],
  ["Bağlantıyı kontrol et.", "Check the link."],
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
  ["Orijinal ürün fotoğrafı", "Original product photo"],
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
  ["SVG görüntüsünün ve indirilecek PNG'nin bilinen ızgarasından veri okunur; biçim, yönlendirme alanları, hata kontrolü ve içerik eşleşmesi sınanır. Nihai boyut, 6 piksel/modül ve hafif bulanıklıkta toplam 9 kontrol yapılır.", "Data is read from the known grid of the SVG and downloadable PNG. Format, finder areas, error correction, and payload matching are checked across 9 tests at final size, 6 pixels per module, and slight blur."],
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
  ["Dosya okunamadı.", "The file could not be read."],
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
  ["Geçersiz QR rengi.", "Invalid QR color."],
  ["Maske geçersiz.", "Invalid QR mask."],
  ["QR ızgarası geçersiz.", "Invalid QR grid."],
  ["Biçim bilgisi kopyaları uyuşmuyor.", "The format information copies do not match."],
  ["Biçim bilgisinin hata kontrolü başarısız.", "The format information error check failed."],
  ["QR yönlendirme veya sürüm alanı bozulmuş.", "The QR finder or version area is damaged."],
  ["Veri alanı eksik.", "The QR data area is incomplete."],
  ["QR artık bitleri bozulmuş.", "The QR remainder bits are damaged."],
  ["Veri hata kontrolü başarısız.", "The QR data error check failed."],
  ["Eksik veri.", "Incomplete QR data."],
  ["UTF-8 ECI bekleniyor.", "UTF-8 ECI was expected."],
  ["Bu doğrulayıcı yalnız UTF-8 bayt modunu kabul eder.", "This verifier accepts UTF-8 byte mode only."],
  ["Çıktı kare değil.", "The output is not square."],
  ["QR boş kenarı veya beyaz zemin değişmiş.", "The QR quiet zone or white background has changed."],
  ["SVG görüntülenemedi; doğrulama zaman aşımı.", "The SVG could not be rendered; verification timed out."],
  ["SVG görüntülenemedi.", "The SVG could not be rendered."],
  ["PNG oluşturulamadı.", "The PNG could not be created."],
  ["Canvas kullanılamıyor.", "Canvas is unavailable."],
  ["QR içeriği girilen veriyle eşleşmedi.", "The QR content does not match the entered data."],
  ["İşlem iptal edildi.", "The operation was cancelled."],
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
  ["NDEF etiketi okunamadı.", "The NDEF tag could not be read."],
  ["NFC erişimi HTTPS veya localhost gerektirir.", "NFC access requires HTTPS or localhost."],
  ["Bu tarayıcı Web NFC NDEF erişimi sunmuyor.", "This browser does not provide Web NFC NDEF access."],
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
  [/^Bu içerik için ([0-9]+)px küçük kalıyor[.] En az 4 piksel[/]modül gerekiyor; daha büyük çıktı seçin[.]$/, "This content does not fit at $1px. At least 4 pixels per module are required; choose a larger output."],
  [/^Bu içerik için ([0-9]+)px küçük kalıyor[.] Stilli QR için en az 6 piksel[/]modül gerekiyor; daha büyük çıktı seçin[.]$/, "This content does not fit at $1px. At least 6 pixels per module are required for a styled QR; choose a larger output."],
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


type EnglishGuidance = {what: string; steps: string[]; needs: string; caution: string};
const EN_GUIDANCE: Record<string, EnglishGuidance> = {
  "talking-souvenir": {
    what: "A Cappadocia relief or city souvenir opens an audio story, route, and making-of video. This product adaptation is inspired by the Talking Statues approach.",
    steps: ["Publish the short narration and transcript on an HTTPS page.", "Print its QR code and write the same link to the NFC tag.", "Test the marked tap area with real phones on the finished souvenir."],
    needs: "A hosted story page and a tag suitable for the physical product.",
    caution: "Fridges and metal can disrupt ordinary NFC tags. Test an on-metal or ferrite tag in the final object. Audio starts only after a user action.",
  },
  "product-360": {
    what: "Product packaging or a printed display opens a rotatable 3D product page. AR may be a separate option on supported devices; a direct GLB link alone is not this experience.",
    steps: ["Publish a product page with a working 3D viewer.", "Connect the same page through QR or NFC.", "Check the model, scale, and AR behavior on target devices."],
    needs: "A web-based 3D viewer and a model you have the right to use.",
    caution: "This tool does not create a new viewer-hosting service. AR support varies by device, and dimensional accuracy must be tested separately.",
  },
  "maker-story": {
    what: "A handmade product links to its maker's story, process video, and care information. Each collection can use its own maintained destination.",
    steps: ["Prepare a story page for the product or series.", "Add care and contact links to that page.", "Place QR and a clearly marked NFC area under the product."],
    needs: "A product-story page and rights to use its media.",
    caution: "A URL or ordinary NFC identifier does not prove authenticity. Do not market it as an anti-counterfeit certificate.",
  },
  "repair-guide": {
    what: "A lamp, organizer, or printed product links to assembly guidance, maintenance, and replacement files for the correct version.",
    steps: ["Identify the product version and parts list.", "Publish the guide and a controlled download page.", "Place a durable link where it remains accessible."],
    needs: "A guide and file page matched to the product version.",
    caution: "A download should not start printing automatically. Do not skip printer, material, and safety checks.",
  },
  "tactile-learning": {
    what: "A tactile map, figure, or replica links to description, captions, and understandable learning content, following real museum accessibility patterns.",
    steps: ["Prepare a short audio description and readable transcript.", "Mark the scan point with a tactile cue.", "Test discoverability and access with target users."],
    needs: "An accessible destination page and a text alternative for audio.",
    caution: "Adding QR or NFC does not create accessibility by itself. Finding the tag, screen-reader behavior, and content clarity must be tested together.",
  },
  "memory-gift": {
    what: "A photo block or key ring opens a page containing a short recorded message. A plain link is suitable only for content that may safely be shared.",
    steps: ["Record the message with permission.", "Upload it to a page whose sharing settings you control.", "Explain on the gift what the QR or NFC action opens."],
    needs: "A separate hosting page for the audio or photo.",
    caution: "An unlisted link is not a password. Private family or child content needs authentication and access control; do not write personal data to the tag.",
  },
  "playlist-object": {
    what: "A small printed record or key ring opens a playlist page. Playing it through a speaker with a separate reader is an advanced setup.",
    steps: ["Obtain a shareable playlist link.", "Use the same URL for QR or NFC.", "Explain any target app and account requirements."],
    needs: "A working media or playlist URL.",
    caution: "The tag does not store the music. A subscription, app, and playback confirmation may be required; autoplay is not guaranteed.",
  },
  "recipe-heirloom": {
    what: "A recipe card or kitchen object opens the written recipe and an optional narrated video.",
    steps: ["Publish the recipe and ingredients on a mobile page.", "Add captions or a transcript to narration.", "Protect the scan area from heat and moisture."],
    needs: "A recipe page and permission to use its images and audio.",
    caution: "Private family recordings require access control. Protect the NFC tag from food, heat, and moisture.",
  },
  guestbook: {
    what: "An event card first opens the programme, then a permitted photo-upload and guestbook experience. The linked service changes while the printed URL stays fixed.",
    steps: ["Create the programme and upload page in a separate service.", "Define sharing permissions, storage, and deletion periods.", "Update the fixed destination after the event."],
    needs: "A photo-upload or form service with appropriate access settings.",
    caution: "This tool does not create a guestbook service. Public uploads require moderation and storage controls.",
  },
  "time-capsule": {
    what: "An object links to a letter or video released on a chosen date. The server, not the code, must enforce date and access rules.",
    steps: ["Store the content on a reliable server.", "Enforce release time and authorized users on the server.", "Test early-access attempts against the printed link."],
    needs: "Trusted server time, access control, and durable content storage.",
    caution: "A hidden browser button or client-side date check does not protect content. This tool does not create a time lock.",
  },
  "plant-pot": {
    what: "A planter tag opens species-specific care guidance. A live watering journal requires a separate form and data service.",
    steps: ["Prepare a care page for the plant.", "Choose a water-resistant tag or enclosure.", "Test it with the final pot, soil, and watering routine."],
    needs: "A maintained plant-care link.",
    caution: "Standard NFC does not measure moisture or send reminders by itself. Sensors and notifications require a separate system.",
  },
  scavenger: {
    what: "Each QR or NFC stop in a museum, fair, or neighborhood route reveals the next clue. The simple version is a chain of linked pages.",
    steps: ["Choose permitted physical locations.", "Create an accessible clue page for every stop.", "Test the full route and signs with real participants."],
    needs: "Clue pages and permission to use each location.",
    caution: "Scores, rewards, or single-use participation require a server. A copied code can be shared, so a scan does not prove a physical visit.",
  },
  "branching-story": {
    what: "Bookmarks or collectible cards send readers to alternate endings, audio scenes, and extra illustrations.",
    steps: ["Publish alternate scenes as linked pages.", "Define clearly which branch each card opens.", "Verify every link and media right."],
    needs: "Mobile story pages.",
    caution: "Saving progress across devices requires accounts and a database; a plain QR code cannot do this.",
  },
  "fan-collectible": {
    what: "A figure, badge, or apparel tag opens a making-of journal or collection page. Historical connected-product examples do not imply a current third-party service.",
    steps: ["Build a content page owned by your brand.", "Plan links by series or product.", "Publish a maintenance and link-change policy."],
    needs: "A content page and the required brand and copyright rights.",
    caution: "A public link is not owner-only access. Ownership and membership benefits require separate verification.",
  },
  "exhibition-vote": {
    what: "A code beside an artwork or demo opens comments, voting, or a choice for the next design.",
    steps: ["Build the vote in an external service or your own server.", "Explain what data will be stored.", "Define result publication and repeat-vote rules."],
    needs: "A form or voting service with spam and repeat-participation controls.",
    caution: "QR or NFC does not secure a ballot. Do not present an artistic poll as an official election or identity-verification system.",
  },
  "guest-hub": {
    what: "A printed welcome stand opens house rules, transport, local suggestions, and contact information. Wi-Fi can use a separate standard Wi-Fi QR code.",
    steps: ["Publish an updatable guest page.", "Show a readable short domain on the card.", "Test both QR and NFC on different phones."],
    needs: "A maintained guest-guide URL.",
    caution: "Do not expose door codes or private home details. NFC Wi-Fi records are not a universal automatic connection method on iPhone.",
  },
  "workshop-guide": {
    what: "A machine or fixture label opens setup, safe-use instructions, and the correct version's parts list.",
    steps: ["Show model and version clearly on the page.", "Link only authorized documents and videos.", "Use an on-metal tag or suitable mount on metal surfaces."],
    needs: "A current guide page.",
    caution: "Scanning NFC does not put a machine into a safe state or prove maintenance. Keep a physical fallback for critical instructions.",
  },
  portfolio: {
    what: "A designer or maker's stand opens a portfolio, model viewer, and quotation links.",
    steps: ["Simplify the portfolio for mobile.", "Add relevant samples and a separate contact action.", "Write the portfolio URL to the display's QR or NFC."],
    needs: "A portfolio page and, optionally, a form service.",
    caution: "It does not silently collect contacts or add entries to a phone. New-client data requires an explicit user action.",
  },
  "return-tag": {
    what: "A luggage or pet tag opens a relay contact form without exposing the owner's home address.",
    steps: ["Build a contact page that hides personal details.", "Add abuse limits and notification controls.", "Test the tag for wear and outdoor use."],
    needs: "A contact relay or form, notification service, and abuse controls.",
    caution: "Standard QR or NFC is not GPS and cannot track live location. Do not encode health data, a home address, or a child's name openly.",
  },
  feedback: {
    what: "A branded counter stand opens a genuine customer-feedback page and may link to a review platform when its rules are followed.",
    steps: ["Use the correct verified business review link.", "State that feedback is voluntary and neutral.", "Show the real domain and purpose on the card."],
    needs: "A verified feedback or review link.",
    caution: "Do not offer discounts for reviews or route only happy customers to public reviews. Keep this separate from loyalty rewards.",
  },
  "desk-routine": {
    what: "An NFC personal automation configured by the phone owner can start focus mode, a timer, or a supported smart-home scene. It is not the same as a QR web link.",
    steps: ["Check Shortcuts or Home Assistant support on the phone.", "Pair the tag inside the app and choose the actions.", "Test locked-device, permission, and confirmation behavior."],
    needs: "An automation app and per-user setup on the user's device.",
    caution: "Text written to an NFC tag does not install an automation on another phone. Support and confirmation vary by device and action.",
  },
  "music-dock": {
    what: "A separate NFC reader, Home Assistant, and media player can turn physical cards into a music collection, optionally using a printed enclosure.",
    steps: ["Complete the reader and player setup.", "Map card identifiers to media content.", "Test the enclosure, connection, and duplicate scans."],
    needs: "A reader, home-automation server or app, and media player.",
    caution: "The Renderhane browser page alone is not a jukebox. Hardware, configuration, and media rights are separate requirements.",
  },
  loyalty: {
    what: "A venue or maker can offer controlled tasks, points, or content progress from product cards. A plain QR code carries only the entry link.",
    steps: ["Define membership, reward, and privacy rules.", "Use unique server-side tokens and replay controls.", "Test copied codes and multiple-account abuse."],
    needs: "A backend, user and transaction verification, and abuse prevention.",
    caution: "Ordinary NFC and QR can be copied and do not prove a visit or purchase. Never offer rewards in exchange for platform reviews.",
  },
  "authenticated-edition": {
    what: "A limited edition can use a cryptographic NFC chip, verification server, and controlled product-to-tag provisioning. This is a different product line from an ordinary URL tag.",
    steps: ["Design the secure chip and key-management process.", "Build the verification server and production provisioning flow.", "Test cloning, tag transfer, and replay risks."],
    needs: "A secure NFC chip, key provisioning, backend, and secure product assembly.",
    caution: "A UID or ordinary QR code is not proof of authenticity. Even a secure chip cannot by itself solve the physical binding between a tag and the real product.",
  },
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
  const title = copy[0], word = channel === "qr" ? "QR" : "NFC";
  const guidance = EN_GUIDANCE[idea.id] ?? {
    what: copy[1], steps: ["Prepare the destination.", "Connect the code or tag.", "Test the finished product."],
    needs: "A maintained destination and production plan.", caution: "Test compatibility and do not overclaim the result.",
  };
  const form = idea.canApply
    ? '<form class="rh-idea-link-form" id="rh-idea-form" data-idea-id="' + ideaEscape(idea.id) + '" novalidate><div><h4>Is your link ready?</h4><p>This fills only the ' + word + ' link field. It does not create or contact the destination page.</p></div><label for="rh-idea-url">HTTPS link to use<input id="rh-idea-url" name="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="https://example.com/my-page" aria-describedby="rh-idea-url-help rh-idea-form-status" required></label><small id="rh-idea-url-help">Use a short address under your control. Do not enter private access keys.</small><label class="rh-idea-consent"><input type="checkbox" name="confirm" required><span>I confirm replacing the current ' + word + ' content with this link.</span></label><button class="rh-btn rh-btn-primary" type="submit">Apply to ' + word + ' field <span aria-hidden="true">↑</span></button><p id="rh-idea-form-status" role="status" aria-live="polite"></p><small>' + (channel === "qr" ? "Style and size stay unchanged; readability checks rerun for the new QR code." : "This does not write to a tag automatically. Overwrite consent resets and writing still requires a device action.") + '</small></form>'
    : '<div class="rh-idea-no-auto"><strong>This idea is not a one-click feature.</strong><p>Set up the required service, app, or hardware before production.</p></div>';
  return '<article class="rh-idea-detail" id="rh-idea-detail" tabindex="-1" aria-labelledby="rh-idea-detail-title"><div class="rh-idea-detail-top"><div><div class="rh-idea-meta">IMPLEMENTATION GUIDE · ' + EN_CATEGORIES[idea.category] + '</div><h3 id="rh-idea-detail-title">' + ideaEscape(title) + '</h3></div><button type="button" class="rh-idea-close" data-idea-close aria-label="Close idea details">×</button></div><p class="rh-idea-what">' + ideaEscape(guidance.what) + '</p><div class="rh-idea-detail-grid"><div><h4>How to set it up</h4><ol>' + guidance.steps.map(step => '<li>' + ideaEscape(step) + '</li>').join('') + '</ol><div class="rh-idea-need"><strong>' + EN_READINESS[idea.readiness] + '</strong><p>' + ideaEscape(guidance.needs) + '</p></div></div><div><div class="rh-idea-caution"><strong>Important limitation</strong><p>' + ideaEscape(guidance.caution) + '</p></div><div class="rh-idea-sources"><strong>References and technical foundations</strong>' + englishIdeaSources(idea.sourceIds) + '<small>These are adaptation ideas for Renderhane; the references do not guarantee sales or outcomes.</small></div></div></div>' + form + '</article>';
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
