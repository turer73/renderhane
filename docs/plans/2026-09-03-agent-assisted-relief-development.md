# Renderhane Manufacturing Relief — Agent Destekli Geliştirme Düzeni

**Amaç:** DeepSeek API, Claude Code, Gemini CLI/API ve OpenCode'u geliştirme hızlandırıcısı olarak kullanmak; hiçbir modelin sonucunu tek başına teknik doğruluk kanıtı saymamak.

## Temel karar

Bu araçlar varsayılan olarak Renderhane'nin üretim runtime bağımlılığı değildir. Relief Pro'nun gerçek ürünü deterministik geometri kodu, doğrulama raporu, piksel/mm kayıt ölçümü ve fiziksel benchmarktır.

- **OpenCode:** yerel yürütme ve agent orkestrasyonu,
- **DeepSeek:** düşük maliyetli repo tarama, uygulama, test üretimi ve log analizi,
- **Claude Code:** bağımsız mimari, güvenlik, migration ve üretilebilirlik incelemesi,
- **Gemini CLI/API:** multimodal benchmark denetimi, büyük bağlamlı repo analizi ve görsel katman karşılaştırması,
- **otomatik testler:** yazılım doğruluğunun asgari kapısı,
- **P1S / A1 mini / UV fiziksel testi:** üretim iddiasının nihai kapısı.

## Güvenlik

- API anahtarları Git'e yazılmaz.
- DeepSeek kimliği OpenCode `/connect` veya güvenli yerel credential deposu üzerinden tanımlanır.
- Claude oturumu kendi hesap/credential mekanizmasını kullanır.
- Gemini CLI, `GEMINI_API_KEY` veya kullanıcının mevcut güvenli Google kimlik doğrulamasıyla yerelde çalışır; anahtar hiçbir agent dosyasına yazılmaz.
- `.geminiignore`, yerel sırlar ve özel müşteri varlıkları için ek koruma sağlar; bunun tek güvenlik katmanı olduğu varsayılmaz.
- Agent'lara production Supabase service-role, ödeme, Vercel deploy veya DNS yetkisi verilmez.
- Kullanıcı fotoğrafları ve ticari dosyalar dış modele gönderilmeden önce veri politikası ayrıca değerlendirilir.

## Model rolleri

### DeepSeek hızlı katman

Uygun işler:

- dosya ve sembol keşfi,
- issue'yu küçük görevlere bölme,
- test vakası üretme,
- Python/TypeScript uygulama taslağı,
- log analizi,
- düşük riskli refactor önerisi.

Zor mimari, concurrency, kredi muhasebesi veya geometri invariants kararında tek başına kabul edilmez.

### DeepSeek güçlü katman

Uygun işler:

- tüm repo etkisi olan değişiklik planı,
- zor test hatası ve determinism problemi,
- veri modeli ve idempotency karşılaştırması,
- uzun diff incelemesi.

Yine de sonuç bağımsız reviewer ve test kapısından geçer.

### Claude Code

Claude şu görevlerde ikinci görüş olarak kullanılır:

- Next.js/Supabase job ve kredi akışı,
- güvenlik ve gizli bilgi sınırları,
- migration geriye uyumluluğu,
- geometri doğrulama mantığı,
- benchmark çıkarımlarının kanıt gücü,
- ürün iddiasının teknik kanıttan ileri gidip gitmediği.

Proje subagent'ları:

- `.claude/agents/relief-reviewer.md`
- `.claude/agents/relief-benchmark-auditor.md`

### Gemini CLI/API

Gemini'nin güçlü tarafı bu projede yalnızca kod yazmak değildir; görsel ve teknik artefaktları aynı bağlamda karşılaştırabilmesidir.

Uygun işler:

- front manufacturing master ile maske/depth/relief haritasını karşılaştırma,
- perspektif, stüdyo gölgesi, halo, kopuk ada ve yanlış semantik sıralama tespiti,
- UV renk, white mask, varnish mask ve contour örtüşmesini inceleme,
- P1S/A1 mini/UV fiziksel numune fotoğraflarını ölçüm formuyla birlikte değerlendirme,
- geniş repo değişikliklerinde bağımlılık ve test etkisi taraması,
- benchmark sonuçlarını yapılandırılmış bulgu tablosuna dönüştürme.

Gemini görsel olarak iyi görünen bir sonuçtan manifold, minimum kalınlık, ölçü doğruluğu veya üretime hazır olma sonucu çıkaramaz. Bunlar geometri raporu ve fiziksel ölçümle doğrulanır.

Proje dosyaları:

- `GEMINI.md`
- `.gemini/agents/relief-vision-auditor.md`
- `.gemini/agents/relief-manufacturing-reviewer.md`
- `.geminiignore`

### OpenCode

OpenCode, proje kökündeki `AGENTS.md` dosyasını ve `.opencode/agents/` altındaki uzman agent'ları kullanır:

- `@relief-plan`: salt okunur plan,
- `@relief-builder`: sınırlı uygulama,
- `@relief-reviewer`: bağımsız salt okunur inceleme.

OpenCode'da seçilen provider/model yerel bağlantıya göre değişebilir. Proje yapılandırmasında API anahtarı veya zorunlu model kimliği sabitlenmez.

## Zorunlu çalışma sırası

1. GitHub issue ve kabul kriterlerini oku.
2. OpenCode/DeepSeek plan agent'ıyla yalnızca plan çıkar.
3. Planı insan gözüyle kontrol et.
4. Uygulayıcı agent ile tek küçük vertical slice uygula.
5. Unit/integration testlerini çalıştır.
6. Claude veya Gemini manufacturing reviewer ile bağımsız diff incele.
7. Değişiklik görsel artefaktları etkiliyorsa Gemini vision auditor ile kaynak/mask/depth/UV/preview karşılaştırması yap.
8. Blocker/high bulguları düzelt.
9. Aynı testleri ve ölçümleri tekrar çalıştır.
10. Sonucu issue'ya ölçümlerle kaydet.
11. Fiziksel iddia varsa fiziksel benchmark tamamlanmadan işi kapatma.

## Model bağımsız doğrulama matrisi

| Alan | Uygulayıcı | Bağımsız reviewer | Nesnel kapı |
|---|---|---|---|
| Relief CLI | DeepSeek/OpenCode | Claude veya Gemini manufacturing reviewer | pytest + mesh ölçümleri |
| Depth/mask karşılaştırması | Python/Fal pipeline | Gemini vision auditor + insan | ground-truth katmanlar + manuel süre |
| Next.js API | OpenCode | Claude/Gemini reviewer | type-check + test + auth testleri |
| DB migration | OpenCode | Claude | dry-run/staging + RLS kontrolü |
| UV export | DeepSeek/OpenCode | Gemini vision auditor + Claude | pixel/mm registration testi |
| 3MF export | OpenCode | Claude/Gemini reviewer | lib3mf validation + slicer açılışı |
| Fiziksel numune | İnsan üretimi | Gemini görsel ön inceleme + insan | kumpas, fotoğraf, UV kuponu, kabul formu |
| Üretim varsayılanı | Hiçbir model tek başına seçmez | benchmark auditor | P1S/A1 mini/UV fiziksel veri |

## Agent'ların yapmaması gerekenler

- `master` dalına doğrudan push,
- production deploy,
- production veritabanı migration çalıştırma,
- API key'i dosya veya loga yazma,
- geçmeyen testi atlama veya silme,
- başarısız örnekleri benchmarktan çıkarma,
- AI üretimi GLB'yi üretime hazır diye etiketleme,
- fiziksel test olmadan tolerans/hizalama başarısı iddia etme,
- yalnızca görsel benzerliğe bakarak depth modelini kazanan ilan etme,
- Relief Pro ile Dome'u aynı ürün gibi gösterme.

## İlk kullanım senaryosu — Issue #54

1. DeepSeek/OpenCode `relief-plan`: mevcut `workers/relief` kodu ve testlerini incele, eksik invariants listesini çıkar.
2. DeepSeek/OpenCode `relief-builder`: yalnızca en yüksek öncelikli eksikliği uygula.
3. Claude veya Gemini `relief-manufacturing-reviewer`: diff, determinism, units ve topology incelemesi.
4. `pytest` ve örnek build çıktıları.
5. Sonuçları Issue #54'e ekle.

## İlk multimodal senaryo — Issue #55/#56

1. Kapadokya front master, mask ve depth adaylarını aynı klasöre yerleştir.
2. Gemini `@relief-vision-auditor` ile varlıkların aynı koordinat sisteminde olduğunu doğrula.
3. Her depth adayı için semantik sıralama, halo, metin ve küçük detay bulgularını kaydet.
4. Görsel değerlendirmeyi sayısal skor ve manuel düzeltme süresiyle birleştir.
5. Fiziksel numune çıkmadan model kazananını kesinleştirme.

## Başarı ölçütü

Agent kullanımı ancak şu etkileri sağlıyorsa başarılıdır:

- daha küçük ve denetlenebilir commitler,
- daha yüksek test kapsamı,
- daha az geriye dönük hata,
- görsel bulguların koordinat ve ölçüyle ifade edilmesi,
- kararların issue ve ölçümlere bağlanması,
- insan müdahalesi gereken fiziksel konuların açıkça ayrılması.

Daha fazla kod veya daha güzel yorum üretmek tek başına başarı değildir.
