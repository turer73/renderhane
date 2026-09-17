/* İlham & kullanım fikirleri: QR/NFC araç sayfalarındaki araştırmaya dayalı öneri bölümü.
   Veri ve metin tek dosyalık demoda onaylanan içeriktir; değişiklik demo ile eşitlenmelidir. */
export type IdeaChannel = 'qr' | 'nfc';
export type IdeaCategory = 'product' | 'gift' | 'learning' | 'play' | 'business' | 'automation';
export type IdeaReadiness = 'link' | 'service' | 'setup' | 'hardware';
export interface InspirationIdea {
  id: string; title: string; hook: string; category: IdeaCategory; readiness: IdeaReadiness;
  what: string; steps: string[]; needs: string; caution: string; sourceIds: string[];
  rankQr: number; rankNfc: number; channels: IdeaChannel[]; canApply: boolean;
}
export interface InspirationState { category: string; expanded: boolean; selected: string | null; }
export interface IdeaSource { label: string; url: string; kind: string; note: string; }
export const IDEA_CATEGORIES: Record<IdeaCategory, string> = {
    product: 'Ürün & 3D', gift: 'Hediye & anı', learning: 'Kültür & öğrenme',
    play: 'Oyun & katılım', business: 'İşletme & günlük yaşam', automation: 'Otomasyon',
};
export const IDEA_READINESS: Record<IdeaReadiness, string> = {
    link: 'Bağlantın varsa hazırlanabilir', service: 'Ek servis gerekir',
    setup: 'Uygulamada kurulum gerekir', hardware: 'Özel donanım gerekir',
};
export const IDEA_SOURCES: Record<string, IdeaSource> = {
    "talking": {
        "label": "Talking Statues · QR ile hikâye",
        "url": "https://talkingstatues.com/how-it-works-html/",
        "kind": "Gerçek uygulama",
        "note": "Heykel yanındaki QR ile anlatı deneyimi; buradaki hatıra/magnet önerisi Renderhane uyarlamasıdır."
    },
    "smithsonian": {
        "label": "Smithsonian · Dokunsal erişim",
        "url": "https://americanhistory.si.edu/visit/accessibility/tactile-elements-and-accessible-exhibition-features",
        "kind": "Gerçek uygulama",
        "note": "Müze, dokunsal öğelerle QR/NFC üzerinden görsel betimlemeyi bir arada kullanıyor."
    },
    "ha-story": {
        "label": "Home Assistant · Müzik kartları",
        "url": "https://www.home-assistant.io/blog/2020/09/15/home-assistant-tags",
        "kind": "Gerçek uygulama · 2020",
        "note": "NFC kartlarla müzik ve 3D baskılı okuyucu kasası. Kurulum ve bağlı oynatıcı gerekir; yazı tarihsel uygulama örneğidir."
    },
    "ha": {
        "label": "Home Assistant · Tag entegrasyonu",
        "url": "https://www.home-assistant.io/integrations/tag/",
        "kind": "Teknik kaynak",
        "note": "Etiket taraması, kurulu Home Assistant ve uygun okuyucu/uygulama üzerinden otomasyon tetikleyebilir."
    },
    "shortcuts": {
        "label": "Apple · NFC otomasyon tetikleyicisi",
        "url": "https://support.apple.com/guide/shortcuts/setting-triggers-apde31e9638b/ios",
        "kind": "Teknik kaynak",
        "note": "NFC kişisel otomasyonu cihazda kurulur; etiket tek başına başka telefonlara otomasyon yüklemez."
    },
    "chrome": {
        "label": "Chrome · Web NFC",
        "url": "https://developer.chrome.com/docs/capabilities/nfc",
        "kind": "Teknik kaynak",
        "note": "Tarayıcıda NDEF okuma/yazma, HTTPS ve kullanıcı izni; destek varlığı fiziksel NFC donanımını kanıtlamaz."
    },
    "apple-nfc": {
        "label": "Apple · Core NFC",
        "url": "https://developer.apple.com/documentation/CoreNFC",
        "kind": "Teknik kaynak",
        "note": "iOS uygulamaları NFC okuyup yazabilir. Tarayıcıdaki Web NFC desteğiyle aynı şey değildir."
    },
    "apple-ux": {
        "label": "Apple · NFC etkileşim rehberi",
        "url": "https://developer.apple.com/design/human-interface-guidelines/nfc",
        "kind": "Teknik kaynak",
        "note": "Arka planda uygun etikette bildirim ve kullanıcının açma eylemi; sessiz/koşulsuz işlem vaadi yok."
    },
    "gs1": {
        "label": "GS1 · Digital Link",
        "url": "https://www.gs1.org/standards/gs1-digital-link",
        "kind": "Teknik kaynak",
        "note": "Ürün tanımlayıcılarını web bilgisine bağlar. Her URL otomatik olarak GS1 veya mevzuata uyumlu ürün pasaportu değildir."
    },
    "resolver": {
        "label": "GS1 · Resolver",
        "url": "https://www.gs1.org/standards/resolver",
        "kind": "Teknik kaynak",
        "note": "Sabit kimliği ilgili içerik ve hizmetlere yönlendiren sunucu katmanı; standart kodun kendisi değişmez."
    },
    "ar": {
        "label": "model-viewer · 3D ve AR",
        "url": "https://modelviewer.dev/examples/augmentedreality/",
        "kind": "Teknik kaynak",
        "note": "Barındırılan web görüntüleyicisi; AR için cihaz/tarayıcı desteği ve uygun dosya akışı gerekir."
    },
    "nike": {
        "label": "Nike · NikeConnect arşivi (2017)",
        "url": "https://www.nikeinc.com.cn/tch/page-2408.html",
        "kind": "Tarihsel gerçek uygulama",
        "note": "2017 bağlantılı forma örneği. NikeConnect hizmetinin bugün açık olduğu iddia edilmiyor."
    },
    "ntag": {
        "label": "NXP · NTAG213/215/216",
        "url": "https://www.nxp.com/products/NTAG213_215_216",
        "kind": "Teknik kaynak",
        "note": "144/504/888 bayt kullanıcı belleği; NDEF ek yükü ayrıca yer kaplar. Medya yerine kısa bağlantı uygundur."
    },
    "secure": {
        "label": "NXP · NTAG 424 DNA",
        "url": "https://www.nxp.com/company/about-nxp/newsroom/NW-NTAG-424-DNA",
        "kind": "Teknik kaynak",
        "note": "Kriptografik doğrulama özelliği; uygun çip, anahtar yönetimi ve doğrulama sunucusu birlikte gerekir."
    },
    "metal": {
        "label": "Avery Dennison · Metal yüzeye uygun NFC",
        "url": "https://rfid.averydennison.com/en/home/product-finder/bullseye-on-metal.html",
        "kind": "Teknik kaynak",
        "note": "Ferrit katmanlı on-metal tasarım. Nihai magnet/metal/kaplama birleşimi fiziksel olarak test edilmelidir."
    },
    "quiet": {
        "label": "DENSO WAVE · QR boşluk kuralı",
        "url": "https://www.qrcode.com/en/howto/code.html",
        "kind": "Teknik kaynak",
        "note": "QR çevresinde dört modül boş alan; dekorasyon bu bölgeye taşmamalıdır."
    },
    "faq": {
        "label": "DENSO WAVE · QR sınırları",
        "url": "https://www.qrcode.com/en/faq.html",
        "kind": "Teknik kaynak",
        "note": "Okuma; boyut, baskı ve okuyucudan etkilenir. Stil vermek okuma garantisi değildir."
    },
    "reviews": {
        "label": "Google · Gerçek müşteri değerlendirmesi",
        "url": "https://support.google.com/business/answer/3474122?hl=en",
        "kind": "Platform kuralı",
        "note": "Gerçek değerlendirme istemek için bağlantı/QR kullanılabilir; yorum karşılığı teşvik ve olumlu yoruma yönlendirme yapılmamalıdır."
    }
};
export const INSPIRATION_IDEAS: InspirationIdea[] = [
    {
        "id": "talking-souvenir",
        "title": "Hikâyesini anlatan magnet",
        "hook": "Bir hatıra, bir dakikalık yolculuk.",
        "category": "product",
        "readiness": "link",
        "what": "Kapadokya rölyefi veya şehir magneti; okutunca sesli hikâye, rota ve yapım videosu açar. Ürün, yalnızca görüntü olmaktan çıkar. Bu, Talking Statues yaklaşımından türettiğimiz ürün fikridir.",
        "steps": [
            "Kısa anlatıyı ve metin dökümünü bir HTTPS sayfasına koy.",
            "Aynı bağlantının QR’ını bas, NFC etiketine yaz.",
            "Magnet üzerindeki işaretli dokunma alanını gerçek telefonla test et."
        ],
        "needs": "Barındırılan hikâye sayfası ve fiziksel ürüne uygun etiket.",
        "caution": "Buzdolabı/metal yüzey sıradan NFC etiketini etkileyebilir. On-metal/ferrit seçeneklerini nihai üründe dene. Ses kullanıcı eylemiyle açılır.",
        "sourceIds": [
            "talking",
            "metal",
            "apple-ux"
        ],
        "rankQr": 1,
        "rankNfc": 1,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "product-360",
        "title": "Kutudan çıkan 3D deneyim",
        "hook": "Fotoğrafı gör, modeli çevir.",
        "category": "product",
        "readiness": "link",
        "what": "Ürün kutusu veya 3D baskılı masa kartı, ürünün çevrilebilir 3D sayfasını açar. Desteklenen cihazda AR ayrı seçenek olabilir; doğrudan GLB bağlantısı tek başına bu deneyim değildir.",
        "steps": [
            "Görüntüleyicili ürün sayfanı yayımla.",
            "Ürünün aynı sayfasını QR/NFC ile bağla.",
            "Model, boyut ve AR davranışını hedef cihazlarda kontrol et."
        ],
        "needs": "Web üzerinde çalışan 3D görüntüleyici ve kullanma hakkına sahip model.",
        "caution": "Renderhane bu kartla yeni bir görüntüleyici barındırma hizmeti açmaz. AR desteği cihazdan cihaza değişir; ölçü doğruluğu ayrıca sınanır.",
        "sourceIds": [
            "ar"
        ],
        "rankQr": 2,
        "rankNfc": 5,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "maker-story",
        "title": "Ustasını anlatan ürün",
        "hook": "Etikette isim değil, üretim hikâyesi.",
        "category": "product",
        "readiness": "link",
        "what": "El yapımı takı, seramik veya rölyefin altında; ustanın anlatısı, süreç videosu ve bakım bilgileri yer alır. Her koleksiyonun kendi bağlantısı olabilir.",
        "steps": [
            "Bir ürün/seri hikâye sayfası hazırla.",
            "Bakım ve iletişim bağlantılarını aynı sayfaya ekle.",
            "Ürünün altına QR ve işaretli NFC alanı yerleştir."
        ],
        "needs": "Ürün hikâyesi sayfası; medya kullanım hakları.",
        "caution": "Bir URL veya normal NFC kimliği ürünün orijinalliğini kanıtlamaz. Bunu “sahtecilik önleme sertifikası” diye sunma.",
        "sourceIds": [
            "gs1",
            "secure"
        ],
        "rankQr": 3,
        "rankNfc": 8,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "repair-guide",
        "title": "Tamir edilebilen ürün etiketi",
        "hook": "Kırılan parça, çöpe giden ürün olmasın.",
        "category": "product",
        "readiness": "link",
        "what": "Lamba, organizer veya 3D baskılı ürün; montaj videosu, bakım kılavuzu ve doğru sürüme ait yedek parça dosyalarına bağlanır.",
        "steps": [
            "Ürünün sürümünü ve parça listesini belirle.",
            "Kılavuz ve kontrollü indirme sayfasını yayımla.",
            "Kalıcı bağlantıyı ürünün erişilebilir bir yerine koy."
        ],
        "needs": "Sürümle eşleştirilmiş kılavuz/dosya sayfası.",
        "caution": "Dosya indirmenin baskıyı otomatik başlatması önerilmez. Yazıcı, malzeme ve güvenlik kontrolünü atlama.",
        "sourceIds": [
            "resolver"
        ],
        "rankQr": 7,
        "rankNfc": 7,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "tactile-learning",
        "title": "Dokun, dinle, öğren",
        "hook": "Kabartmayı hisset; anlatıyı dinle.",
        "category": "learning",
        "readiness": "link",
        "what": "Dokunsal harita, hayvan figürü veya müze replikası; betimleme, altyazı ve anlaşılır öğrenme içeriğine bağlanır. Smithsonian’ın QR/NFC erişim uygulaması bu fikre gerçek bir örnektir.",
        "steps": [
            "Kısa sesli betimleme ve okunabilir metin hazırla.",
            "Okutma yerini kabartmalı bir işaretle belirginleştir.",
            "Hedef kullanıcılarla keşfedilebilirlik ve erişimi dene."
        ],
        "needs": "Erişilebilir hedef sayfa; sesin metin alternatifi.",
        "caution": "NFC veya QR eklemek tek başına erişilebilirlik sağlamaz. Etiketi bulma, ekran okuyucu ve içerik anlaşılabilirliği birlikte test edilir.",
        "sourceIds": [
            "smithsonian"
        ],
        "rankQr": 4,
        "rankNfc": 2,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "memory-gift",
        "title": "Sesli fotoğraf hediyesi",
        "hook": "Bir kareye bir ses ekle.",
        "category": "gift",
        "readiness": "link",
        "what": "Fotoğraf bloğu veya anahtarlık, veren kişinin kaydettiği kısa mesajın bulunduğu sayfayı açar. Yalnızca kamuya açık paylaşılması uygun içerikle basit URL akışı kullanılabilir.",
        "steps": [
            "Mesajı izin alarak kaydet.",
            "Paylaşım ayarlarını kontrol ettiğin bir sayfaya yükle.",
            "Hediye üzerine QR/NFC ve ne açılacağını anlatan kısa not ekle."
        ],
        "needs": "Ses/fotoğraf için ayrı barındırma sayfası.",
        "caution": "Gizli bağlantı parola değildir. Özel aile/çocuk içeriği için giriş ve erişim kontrolü gerekir; etikete kişisel bilgi yazma.",
        "sourceIds": [
            "ha-story",
            "apple-ux"
        ],
        "rankQr": 8,
        "rankNfc": 3,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "playlist-object",
        "title": "Fiziksel çalma listesi",
        "hook": "Masa üstünde bir albüm koleksiyonu.",
        "category": "gift",
        "readiness": "link",
        "what": "3D baskılı minik plak veya anahtarlık bir çalma listesi sayfasını açar. Ayrı okuyucuyla hoparlörde çalma ise ileri kurulumdur.",
        "steps": [
            "Paylaşılabilir çalma listesi bağlantısını al.",
            "QR veya NFC için aynı URL’yi hazırla.",
            "Hedef müzik uygulaması ve hesap gereksinimini kullanıcıya açıkla."
        ],
        "needs": "Çalışan medya/çalma listesi URL’si.",
        "caution": "Etiket müziği içine depolamaz; abonelik, uygulama ve başlatma onayı gerekebilir. Otomatik çalma garanti değildir.",
        "sourceIds": [
            "ha-story",
            "ntag"
        ],
        "rankQr": 9,
        "rankNfc": 4,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "recipe-heirloom",
        "title": "Nesilden nesile tarif",
        "hook": "Tarif defteri, aile sesiyle buluşsun.",
        "category": "gift",
        "readiness": "link",
        "what": "Bir tarif kartı, kesme tahtası askısı veya buzdolabı kartı; yazılı tarif ve isteğe bağlı anlatım videosunu açar.",
        "steps": [
            "Tarifi ve malzeme listesini mobil sayfaya aktar.",
            "Varsa anlatımın altyazısını ekle.",
            "Isı/nemden korunmuş okutma alanı oluştur."
        ],
        "needs": "Tarif sayfası; görüntü ve ses izinleri.",
        "caution": "Özel aile kayıtlarında erişim kontrolü gerekir. NFC etiketi gıda/ısı teması için uygun muhafazada olmalıdır.",
        "sourceIds": [
            "ha-story"
        ],
        "rankQr": 14,
        "rankNfc": 10,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "guestbook",
        "title": "Davetiyeden anı defterine",
        "hook": "Aynı kart, etkinlikten sonra da yaşasın.",
        "category": "gift",
        "readiness": "service",
        "what": "Düğün/mezuniyet kartı önce programı, sonra izinli fotoğraf yükleme ve anı defterini açar. İçerik değişimi bağlı sayfada gerçekleşir.",
        "steps": [
            "Program ve yükleme sayfanı ayrı bir hizmette hazırla.",
            "Paylaşım izinlerini, depolama ve silme süresini belirle.",
            "Karttaki sabit URL’nin içeriğini etkinlik sonrası güncelle."
        ],
        "needs": "Fotoğraf yükleme/form servisi ve erişim ayarları.",
        "caution": "Bu araç anı defteri servisi oluşturmaz. Herkese açık yükleme bağlantısı moderasyon ve depolama kontrolü gerektirir.",
        "sourceIds": [
            "resolver"
        ],
        "rankQr": 5,
        "rankNfc": 13,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "time-capsule",
        "title": "Zaman kapsülü hediyesi",
        "hook": "Bugün ver, belirlediğin gün açılsın.",
        "category": "gift",
        "readiness": "service",
        "what": "Bir obje, belirlenen tarihte açılan mektup veya video sayfasına bağlanır. Sürpriz, kodda değil sunucunun tarih ve erişim denetimindedir.",
        "steps": [
            "İçeriği güvenilir bir sunucuda sakla.",
            "Açılma tarihi ve yetkili kullanıcıları sunucuda tanımla.",
            "Karttaki URL’yi erken erişim denemeleriyle test et."
        ],
        "needs": "Sunucu saati, erişim denetimi ve içerik saklama.",
        "caution": "Tarayıcıdaki gizli düğme veya istemci tarih kontrolü içeriği korumaz. Bu sürüm zaman kilidi kurmaz.",
        "sourceIds": [
            "resolver"
        ],
        "rankQr": 20,
        "rankNfc": 20,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": false
    },
    {
        "id": "plant-pot",
        "title": "Bakım anlatan saksı",
        "hook": "Her bitkinin kendi bakım kartı.",
        "category": "learning",
        "readiness": "link",
        "what": "Saksı etiketi; bitki türü, bakım notları ve kullanıcıya ait rehberi açar. Canlı sulama günlüğü eklemek ayrı bir form/veri hizmeti gerektirir.",
        "steps": [
            "Bitkiye özel bakım sayfanı hazırla.",
            "Saksı için suya dayanıklı etiket/kılıf seç.",
            "Etiketi, toprak ve suyla birlikte kullanımda dene."
        ],
        "needs": "Bakım rehberi bağlantısı.",
        "caution": "Standart NFC nem ölçmez, kendi kendine hatırlatma göndermez. Sensör ve bildirim özellikleri ayrı sistemdir.",
        "sourceIds": [
            "ntag",
            "resolver"
        ],
        "rankQr": 6,
        "rankNfc": 11,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "scavenger",
        "title": "Şehirde hikâye avı",
        "hook": "Her durak bir sonraki ipucunu açsın.",
        "category": "play",
        "readiness": "link",
        "what": "Müze, fuar veya mahalle rotasında QR/NFC ile yeni bir bilmece açılır. Basit sürüm birbirine bağlı sayfalardan oluşur.",
        "steps": [
            "İzinli alanlarda duraklarını belirle.",
            "Her durak için erişilebilir ipucu sayfası hazırla.",
            "Rota ve işaretleri baştan sona gerçek kullanıcıyla dene."
        ],
        "needs": "İpucu sayfaları; alan kullanım izni.",
        "caution": "Puan, ödül ve tek seferlik katılım için sunucu gerekir. Kodun kopyası bulunabilir; tarama fiziksel ziyareti kanıtlamaz.",
        "sourceIds": [
            "talking",
            "resolver"
        ],
        "rankQr": 10,
        "rankNfc": 14,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "branching-story",
        "title": "Seçimini yapan okur",
        "hook": "Bir kitap, birden fazla son.",
        "category": "play",
        "readiness": "link",
        "what": "Kitap ayracı veya koleksiyon kartları; okuyucuyu farklı sonlara, sesli sahnelere ve ek illüstrasyonlara götürür.",
        "steps": [
            "Alternatif sahneleri bağlantılı sayfalar olarak kur.",
            "Kartların hangi dala götüreceğini açıkça belirle.",
            "Her bağlantıyı ve medya hakkını kontrol et."
        ],
        "needs": "Mobil hikâye sayfaları.",
        "caution": "Kullanıcı ilerlemesini cihazlar arasında saklamak üyelik/veritabanı gerektirir; basit QR bunu yapmaz.",
        "sourceIds": [
            "talking"
        ],
        "rankQr": 11,
        "rankNfc": 16,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "fan-collectible",
        "title": "Bağlantılı koleksiyon ürünü",
        "hook": "Koleksiyonun hikâyesi satın alma ile bitmesin.",
        "category": "play",
        "readiness": "link",
        "what": "Figür, rozet veya forma etiketi; yapım günlüğü ve koleksiyona özel içerik sayfasını açar. NikeConnect’in 2017 örneği tarihsel ilhamdır, güncel hizmet önerisi değildir.",
        "steps": [
            "Kendi markana ait içerik sayfasını kur.",
            "Seri veya ürün başına bağlantı planla.",
            "Etiketin sürekliliğini ve değişiklik politikasını yaz."
        ],
        "needs": "İçerik sayfası; marka/telif hakları.",
        "caution": "Herkese açık link “yalnız ürün sahibine özel” koruma sağlamaz. Sahiplik ve üyelik için ayrıca doğrulama gerekir.",
        "sourceIds": [
            "nike",
            "secure"
        ],
        "rankQr": 12,
        "rankNfc": 12,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "exhibition-vote",
        "title": "Katılımcı sergi",
        "hook": "Bakmakla kalma, serginin devamını seç.",
        "category": "play",
        "readiness": "service",
        "what": "Bir sanat eseri veya fuar demosunun yanındaki kod; yorum, oylama veya sonraki tasarım seçimini açar.",
        "steps": [
            "Oylama formunu harici hizmette veya kendi sunucunda kur.",
            "Hangi verinin tutulacağını açıkla.",
            "Sonuç yayınlama ve tekrar oy kurallarını belirle."
        ],
        "needs": "Form/oylama servisi; spam ve tekrar katılım kontrolü.",
        "caution": "QR/NFC oyları güvence altına almaz. Sanatsal anketi resmi seçim veya kimlik doğrulama sistemi gibi sunma.",
        "sourceIds": [
            "resolver"
        ],
        "rankQr": 19,
        "rankNfc": 22,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "guest-hub",
        "title": "Misafir için tek giriş",
        "hook": "Konaklama rehberi tek kartta.",
        "category": "business",
        "readiness": "link",
        "what": "3D baskılı karşılama standı; ev kuralları, ulaşım, yerel öneriler ve iletişim sayfasını açar. WiFi için ayrıca standart WiFi QR kullanılabilir.",
        "steps": [
            "Güncellenebilir misafir sayfanı yayımla.",
            "Kısa alan adını kartta okunur şekilde göster.",
            "Hem QR hem NFC ile farklı telefonlarda dene."
        ],
        "needs": "Misafir rehberi URL’si.",
        "caution": "Kapı kodlarını ve özel ev bilgilerini herkese açık sayfaya koyma. NFC WiFi kaydı iPhone’da evrensel otomatik bağlantı değildir.",
        "sourceIds": [
            "resolver",
            "chrome"
        ],
        "rankQr": 13,
        "rankNfc": 6,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "workshop-guide",
        "title": "Atölyede doğru kılavuz",
        "hook": "Makinenin yanında doğru sürüm.",
        "category": "business",
        "readiness": "link",
        "what": "Bir aparat veya makine etiketi; kurulum, güvenli kullanım ve parça listesinin ilgili sürümüne gider. 3D baskılı etiket tutucusu fiziksel ürüne dönüşebilir.",
        "steps": [
            "Model/sürüm bilgilerini sayfada açıkça belirt.",
            "Yetkili doküman ve videoları bağla.",
            "Metal yüzeyde on-metal etiket veya uygun montaj dene."
        ],
        "needs": "Güncel kılavuz sayfası.",
        "caution": "NFC taramak makineyi güvenli moda geçirmez; bakımın yapıldığını kanıtlamaz. Kritik talimatların fiziksel alternatifi kalmalı.",
        "sourceIds": [
            "resolver",
            "metal"
        ],
        "rankQr": 15,
        "rankNfc": 9,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "portfolio",
        "title": "Dokunulan portfolyo",
        "hook": "Kartvizitten önce yaptığın iş görünsün.",
        "category": "business",
        "readiness": "link",
        "what": "Mimar, 3D tasarımcı veya üreticinin standı; portfolyo, model inceleme ve teklif isteme bağlantılarına gider.",
        "steps": [
            "Mobil portfolyonu sadeleştir.",
            "İlgili örnekleri ve ayrı iletişim bağlantısını ekle.",
            "Stand veya karttaki QR/NFC’ye portfolyo URL’sini yaz."
        ],
        "needs": "Portfolyo sayfası; isteğe bağlı form hizmeti.",
        "caution": "Telefon kişilerini otomatik toplamaz veya rehbere sessizce kaydetmez. Yeni müşteri bilgisi için açık kullanıcı eylemi gerekir.",
        "sourceIds": [
            "ar",
            "apple-ux"
        ],
        "rankQr": 16,
        "rankNfc": 15,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "return-tag",
        "title": "Mahremiyetli geri dönüş etiketi",
        "hook": "Bulana kolaylık, sahibine kontrol.",
        "category": "business",
        "readiness": "service",
        "what": "Valiz veya evcil hayvan tasması; sahibinin ev adresini göstermeden bir iletişim formuna bağlanır.",
        "steps": [
            "Kişisel bilgiyi gizleyen iletişim sayfası kur.",
            "Kötüye kullanım ve bildirim sınırları ekle.",
            "Etiketi aşınma ve dış ortamda test et."
        ],
        "needs": "İletişim aracısı/form, bildirim servisi, kötüye kullanım kontrolü.",
        "caution": "Standart QR/NFC GPS değildir; canlı konum izlemez. Sağlık, ev adresi veya çocuk adı gibi bilgileri açık kod içine yazma.",
        "sourceIds": [
            "ntag",
            "resolver"
        ],
        "rankQr": 17,
        "rankNfc": 17,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "feedback",
        "title": "Geri bildirimi kolaylaştıran stand",
        "hook": "Yıldız isteme; gerçek deneyimi dinle.",
        "category": "business",
        "readiness": "link",
        "what": "Tezgâhtaki markalı stand; gerçek müşteri geri bildirim sayfasını açar. Google değerlendirme linki de uygun kurallarla kullanılabilir.",
        "steps": [
            "Doğru işletmenin değerlendirme bağlantısını al.",
            "Yorumun gönüllü ve tarafsız olacağını belirt.",
            "Kartta gerçek alan adını ve amacını göster."
        ],
        "needs": "Doğrulanmış değerlendirme bağlantısı.",
        "caution": "Yorum karşılığı indirim/ödül veya sadece memnun müşteriyi açık yoruma yönlendirme yapma. Bu, sadakat puanı fikrinden ayrı tutulmalıdır.",
        "sourceIds": [
            "reviews"
        ],
        "rankQr": 18,
        "rankNfc": 18,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": true
    },
    {
        "id": "desk-routine",
        "title": "Masa üstü rutin düğmesi",
        "hook": "Bir nesneyle çalışma moduna geç.",
        "category": "automation",
        "readiness": "setup",
        "what": "Telefon sahibinin kurduğu NFC kişisel otomasyonu; odak modu, zamanlayıcı veya uygun akıllı ev sahnesini başlatabilir. QR web bağlantısıyla aynı davranış değildir.",
        "steps": [
            "Telefonundaki Shortcuts/Home Assistant desteğini kontrol et.",
            "Etiketi uygulamanın içinde eşleştir ve eylemleri seç.",
            "Kilit/izin koşullarında beklenen davranışı test et."
        ],
        "needs": "Kullanıcı cihazında otomasyon uygulaması ve kurulum.",
        "caution": "NFC etikete yazılan bir metin başkasının telefonuna otomasyon yüklemez. Destek ve onay davranışı cihaza/eyleme göre değişir.",
        "sourceIds": [
            "shortcuts",
            "ha"
        ],
        "rankQr": 24,
        "rankNfc": 19,
        "channels": [
            "nfc"
        ],
        "canApply": false
    },
    {
        "id": "music-dock",
        "title": "3D baskılı müzik istasyonu",
        "hook": "Kartı bırak, doğru odada çalsın.",
        "category": "automation",
        "readiness": "hardware",
        "what": "Ayrı NFC okuyucu, Home Assistant ve medya oynatıcıyla fiziksel kart koleksiyonu oluşturulur. 2020 resmi örneğinde 3D baskılı kasa kullanılmıştır.",
        "steps": [
            "Okuyucu ve bağlı oynatıcı kurulumunu tamamla.",
            "Kart kimliklerini içeriklere eşleştir.",
            "Kasa, bağlantı ve beklenmeyen tekrar taramayı test et."
        ],
        "needs": "Okuyucu, ev otomasyon sunucusu/uygulaması ve medya oynatıcı.",
        "caution": "Renderhane’nin tarayıcı sayfası tek başına jukebox değildir. Donanım, kurulum ve medya kullanım hakkı ayrı gerekir.",
        "sourceIds": [
            "ha-story",
            "ha"
        ],
        "rankQr": 25,
        "rankNfc": 21,
        "channels": [
            "nfc"
        ],
        "canApply": false
    },
    {
        "id": "loyalty",
        "title": "Koleksiyonla ilerleyen sadakat",
        "hook": "Her fiziksel ürün yeni bölüm açsın.",
        "category": "play",
        "readiness": "service",
        "what": "Kafe, müze veya üretici; ürün kartları üzerinden kontrollü görev, puan veya içerik ilerlemesi sunar. Basit QR yalnızca giriş bağlantısını taşır.",
        "steps": [
            "Üyelik, ödül ve gizlilik kurallarını kur.",
            "Sunucuda tekil token ve tekrar kullanım denetimi yap.",
            "Kopyalanmış kod ve birden çok hesap senaryosunu test et."
        ],
        "needs": "Backend, kullanıcı/işlem doğrulama ve kötüye kullanım önlemleri.",
        "caution": "Normal NFC/QR kopyalanabilir; fiziksel ziyaret veya satın alma kanıtı değildir. Google yorumu karşılığı ödül teklif etme.",
        "sourceIds": [
            "resolver",
            "secure",
            "reviews"
        ],
        "rankQr": 21,
        "rankNfc": 23,
        "channels": [
            "qr",
            "nfc"
        ],
        "canApply": false
    },
    {
        "id": "authenticated-edition",
        "title": "Doğrulanan özel seri",
        "hook": "Etiket değil, doğrulama zinciri.",
        "category": "product",
        "readiness": "hardware",
        "what": "Sınırlı seri obje için kriptografik NFC çipi, sunucu doğrulaması ve güvenli ürün–etiket eşleştirmesi kurulabilir. Sıradan URL etiketinden farklı bir ürün hattıdır.",
        "steps": [
            "Uygun güvenli çip ve anahtar yönetimi tasarla.",
            "Doğrulama sunucusu ve üretim eşleştirmesini kur.",
            "Etiket kopyalama, taşıma ve tekrar oynatma risklerini test et."
        ],
        "needs": "Güvenli NFC çipi, anahtar hazırlama, backend ve ürün montajı.",
        "caution": "UID veya normal QR “orijinal ürün” kanıtı değildir. Güvenli çip bile etiketi gerçek ürüne fiziksel bağlama problemini tek başına çözmez.",
        "sourceIds": [
            "secure"
        ],
        "rankQr": 22,
        "rankNfc": 24,
        "channels": [
            "nfc"
        ],
        "canApply": false
    }
];
const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function ideaEscape(value: string): string {
  return String(value).replace(/[&<>"']/g, c => ESCAPE_MAP[c] ?? c);
}
export function getInspirationIdeas(channel: IdeaChannel, category = 'all'): InspirationIdea[] {
  if (category !== 'all' && !(category in IDEA_CATEGORIES)) return [];
  return INSPIRATION_IDEAS.filter(i => i.channels.includes(channel) && (category === 'all' || i.category === category))
    .sort((a, b) => channel === 'qr' ? a.rankQr - b.rankQr : a.rankNfc - b.rankNfc);
}
export function getInspirationIdea(channel: IdeaChannel, id: string): InspirationIdea | undefined {
  return INSPIRATION_IDEAS.find(i => i.id === id && i.channels.includes(channel));
}
/** Bu akış yalnızca verilen bağlantıyı kodlar; adresi ziyaret etmez, hedef sayfa oluşturmaz. */
export function validateIdeaUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error('Önce sana ait veya paylaşma iznin olan sayfanın bağlantısını gir.');
  if (raw.length > 2048) throw new Error('Daha kısa bir bağlantı kullan; en fazla 2048 karakter.');
  if (/[\u0000-\u001f\u007f<>\\]/.test(raw) || !/^https:\/\//i.test(raw))
    throw new Error('Bu hazırlama akışında yalnızca geçerli HTTPS bağlantıları kabul edilir.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Geçerli bir HTTPS bağlantısı gir.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
    throw new Error('Kullanıcı adı veya parola içermeyen bir HTTPS adresi kullan.');
  return url.href;
}
const IDEA_ICONS: Record<IdeaCategory, string> = {
  product: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
  learning: '<path d="M12 6c-3-3-7-2-10-1v15c3-1 7-2 10 1 3-3 7-2 10-1V5c-3-1-7-2-10 1ZM12 6v15"/>',
  play: '<path d="m10 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM19 15v6M16 18h6"/>',
  business: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c6 4 12 4 18 0M12 12v4"/>',
  automation: '<path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z"/>',
};
export function ideaIcon(cat: IdeaCategory): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IDEA_ICONS[cat]}</svg>`;
}
export function ideaSourceList(ids: string[]): string {
  return ids.map(id => { const x = IDEA_SOURCES[id]; return x ? `<a href="${ideaEscape(x.url)}" target="_blank" rel="noopener noreferrer">${ideaEscape(x.label)} <span aria-hidden="true">↗</span></a>` : ''; }).join('');
}
export function ideaDetail(idea: InspirationIdea, channel: IdeaChannel): string {
  const word = channel === 'qr' ? 'QR' : 'NFC';
  return `<article class="rh-idea-detail" id="rh-idea-detail" tabindex="-1" aria-labelledby="rh-idea-detail-title">
   <div class="rh-idea-detail-top"><div><div class="rh-idea-meta">UYGULAMA TARİFİ · ${ideaEscape(IDEA_CATEGORIES[idea.category])}</div><h3 id="rh-idea-detail-title">${ideaEscape(idea.title)}</h3></div><button type="button" class="rh-idea-close" data-idea-close aria-label="Fikir ayrıntısını kapat">×</button></div>
   <p class="rh-idea-what">${ideaEscape(idea.what)}</p>
   <div class="rh-idea-detail-grid"><div><h4>Nasıl kurulur?</h4><ol>${idea.steps.map(x => `<li>${ideaEscape(x)}</li>`).join('')}</ol><div class="rh-idea-need"><strong>${ideaEscape(IDEA_READINESS[idea.readiness])}</strong><p>${ideaEscape(idea.needs)}</p></div></div>
   <div><div class="rh-idea-caution"><strong>Önemli sınır</strong><p>${ideaEscape(idea.caution)}</p></div><div class="rh-idea-sources"><strong>Gerçek örnek ve teknik dayanaklar</strong>${ideaSourceList(idea.sourceIds)}<small>Fikirler Renderhane için önerilen uyarlamalardır; kaynaklar bir başarı veya satış garantisi değildir.</small></div></div></div>
   ${idea.canApply ? `<form class="rh-idea-link-form" id="rh-idea-form" data-idea-id="${ideaEscape(idea.id)}" novalidate>
     <div><h4>Bağlantın hazır mı?</h4><p>Yalnızca ${word} bağlantı alanını doldurur. Hikâye, form veya 3D sayfası oluşturulmaz; bağlantıya istek gönderilmez.</p></div>
     <label for="rh-idea-url">Kullanacağın HTTPS bağlantısı<input id="rh-idea-url" name="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="https://ornek.com/benim-sayfam" aria-describedby="rh-idea-url-help rh-idea-form-status" required></label>
     <small id="rh-idea-url-help">Kısa ve kontrolün altında bir adres seç. Özel erişim anahtarlarını bu alana yazma.</small>
     <label class="rh-idea-consent"><input type="checkbox" name="confirm" required><span>Mevcut ${word} içeriğini bu bağlantıyla değiştirmeyi onaylıyorum.</span></label>
     <button class="rh-btn rh-btn-primary" type="submit">${word} alanına aktar <span aria-hidden="true">↑</span></button><p id="rh-idea-form-status" role="status" aria-live="polite"></p>
     <small>${channel === 'qr' ? 'Stil ve boyut korunur; yeni QR için okuma kontrolü yeniden çalışır.' : 'Etikete otomatik yazılmaz. Üzerine yazma onayı sıfırlanır; cihazda ayrıca yazma eylemi gerekir.'}</small>
   </form>` : `<div class="rh-idea-no-auto"><strong>Bu fikir tek tıklık bir özellik değil.</strong><p>Önce yukarıdaki uygulama, servis veya donanım kurulmalıdır. Bu kart bunları otomatik kurmaz; doğrudan üretim/yazma düğmesi bu nedenle sunulmaz.</p></div>`}
 </article>`;
}
export function ideaReality(channel: IdeaChannel): string {
  if (channel === 'qr')
    return `<details class="rh-idea-reality"><summary>QR’ı basmadan önce: bağlantı, güven ve okunabilirlik</summary><div>
  <p><strong>Aynı bağlantı, iki giriş:</strong> Görünür QR, NFC desteklemeyen telefonlar için alternatif olabilir. Aynı HTTPS adresini ikisinde de kullan; kısa alan adını baskıda yazıyla da göster.</p>
  <p><strong>Medya kodun içinde değil:</strong> Video, ses, form ve 3D deneyimi hedef sayfada yaşar. URL kodlamak o sayfayı barındırmaz, izinlerini ayarlamaz veya analitik hizmeti kurmaz.</p>
  <p><strong>Değişen içerik:</strong> Kendi kalıcı adresinin içeriğini ya da sunucu yönlendirmesini güncelleyebilirsin. Basılmış QR’ın içindeki adres kendiliğinden değişmez; alan adı ve hizmet sürekliliği önemlidir.</p>
  <p><strong>Önce okunabilirlik:</strong> Fikirler QR matrisini değiştirmez. Dört modüllük boş alan korunmalı; parlak/şeffaf/katlanmış yüzey, hedef baskı boyutu ve gerçek telefonlarla kontrol gerekir. Yazılım kontrolü evrensel garanti değildir.</p>
  <p><strong>Tarama ≠ sahiplik:</strong> Normal kod kopyalanabilir; indirim, katılım ve ürün doğrulaması için ek güvenlik gerekir. İzin olmadan konum veya kişisel veri toplama.</p>
  <div class="rh-idea-source-row">${ideaSourceList(['quiet', 'faq', 'resolver', 'secure'])}</div>
 </div></details>`;
  return `<details class="rh-idea-reality"><summary>NFC’yi ürüne yerleştirmeden önce: cihaz, malzeme ve güven</summary><div>
  <p><strong>Yazma ile okuma farklı:</strong> Bu sayfanın yazma yolu, NFC donanımlı uyumlu Android/Chrome, HTTPS ve izin gerektirir. iPhone’da bu tarayıcı yazma yolu sunulmaz; uygun iOS uygulamaları Core NFC ile yazabilir. URL etiketi okumada bildirim veya açma eylemi gerekebilir.</p>
  <p><strong>Kısa link kullan:</strong> Yaygın NTAG213/215/216 çiplerinde kullanıcı belleği 144/504/888 bayttır; NDEF ek yükü ayrıca yer kaplar. Uzun medya dosyasını etikete yüklemek yerine sayfasını bağla.</p>
  <p><strong>Magnet ve metal:</strong> Buzdolabına takılacak ürünü montajdan önce değil, nihai halinde test et. Metal için ferritli on-metal etiket gerekebilir; etiket konumu, muhafaza ve telefon sonucu etkiler.</p>
  <p><strong>İzleyici değil:</strong> Standart pasif NFC etiketi GPS cihazı değildir. Telefona dokundurmadan canlı konum bildirimi yapmaz. URL/UID, orijinallik veya fiziksel ziyaret kanıtı değildir.</p>
  <p><strong>Güvenli teslim:</strong> Önce oku-yaz-test et. İçeriği kilitleme bazı etiketlerde kalıcıdır; burada otomatik kilitleme yoktur. NFC yanında görünür QR ve yazılı adres bırak.</p>
  <div class="rh-idea-source-row">${ideaSourceList(['chrome', 'apple-nfc', 'apple-ux', 'ntag', 'metal', 'secure'])}</div>
 </div></details>`;
}
export function renderInspiration(channel: IdeaChannel, state: InspirationState): string {
  const all = getInspirationIdeas(channel), filtered = getInspirationIdeas(channel, state.category);
  const visible = state.expanded ? filtered : filtered.slice(0, 6);
  const selected = state.selected ? getInspirationIdea(channel, state.selected) : undefined;
  const cats = (Object.entries(IDEA_CATEGORIES) as Array<[IdeaCategory, string]>).filter(([k]) => all.some(i => i.category === k));
  return `<section class="rh-ideas" id="rh-inspiration" aria-labelledby="rh-ideas-title">
  <header class="rh-ideas-header"><div><div class="rh-idea-eyebrow"><span></span> İLHAM & KULLANIM FİKİRLERİ</div><h2 id="rh-ideas-title">${channel === 'qr' ? 'Bir koddan<br><em>daha fazlası.</em>' : 'Bir dokunuş.<br><em>Yeni bir deneyim.</em>'}</h2><p>Hikâye anlatan ürünler, bağlantılı hediyeler ve gerçek kullanım fikirleri. İlhamını seç; gereken altyapıyı gör.</p></div><div class="rh-idea-hero-note"><span>${all.length}</span><strong>${channel === 'qr' ? 'QR ile uygulanabilecek' : 'NFC için seçilmiş'} fikir</strong><p>Mevcut bağlantıyla başlanabilenler ile ek servis, uygulama veya donanım isteyenler açıkça ayrıldı.</p><small>Kaynak incelemesi · 17 Eylül 2026</small></div></header>
  <div class="rh-idea-intro"><strong>Bu bölüm ne yapar?</strong><span>Fikir verir ve hazır bağlantını araca taşır. İçerik barındırma, sipariş, puan, otomasyon veya doğrulama servisi oluşturmaz.</span></div>
  <div class="rh-idea-filters" role="group" aria-label="Fikir kategorisi"><button type="button" data-idea-filter="all" aria-pressed="${state.category === 'all'}">Tümü <span>${all.length}</span></button>${cats.map(([k, v]) => `<button type="button" data-idea-filter="${k}" aria-pressed="${state.category === k}">${ideaEscape(v)}</button>`).join('')}</div>
  <div class="rh-idea-count" aria-live="polite">${filtered.length} fikirden ${visible.length} tanesi gösteriliyor${state.category === 'all' ? ' · Başlangıç için seçtiklerimiz' : ''}</div>
  <div id="rh-idea-details-slot">${selected ? ideaDetail(selected, channel) : ''}</div>
  <div class="rh-idea-grid">${visible.map((idea, n) => `<article class="rh-idea-card"><div class="rh-idea-card-top"><span class="rh-idea-icon">${ideaIcon(idea.category)}</span><span class="rh-idea-number">${String(n + 1).padStart(2, '0')}</span></div><span class="rh-idea-badge ${idea.readiness}">${ideaEscape(IDEA_READINESS[idea.readiness])}</span><h3>${ideaEscape(idea.title)}</h3><p>${ideaEscape(idea.hook)}</p><button class="rh-idea-open" data-idea="${idea.id}" aria-expanded="${selected?.id === idea.id}" aria-controls="rh-idea-details-slot" type="button">${selected?.id === idea.id ? 'Ayrıntı açık' : 'Fikri incele'} <span aria-hidden="true">↗</span><span class="rh-idea-sr"> · ${ideaEscape(idea.title)}</span></button></article>`).join('')}</div>
  ${filtered.length > 6 ? `<div class="rh-idea-more-wrap"><button type="button" class="rh-btn rh-btn-outline" data-idea-more aria-expanded="${state.expanded}">${state.expanded ? 'İlk 6 fikre dön' : `${filtered.length - 6} fikri daha gör`} <span aria-hidden="true">${state.expanded ? '−' : '+'}</span></button></div>` : ''}
  ${ideaReality(channel)}
  <p class="rh-idea-endnote">Araştırmaya dayalı öneriler · QR şekli/okuma kontrolü ve NFC yazma güvenlikleri bu bölümden bağımsız korunur.</p>
 </section>`;
}
