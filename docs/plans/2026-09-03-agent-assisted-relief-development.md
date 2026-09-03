# Renderhane Manufacturing Relief — Agent Destekli Geliştirme Düzeni

**Amaç:** DeepSeek API, Claude Code ve OpenCode'u geliştirme hızlandırıcısı olarak kullanmak; hiçbir modelin sonucunu tek başına teknik doğruluk kanıtı saymamak.

## Temel karar

Bu araçlar Renderhane'nin üretim runtime bağımlılığı değildir. Relief Pro'nun gerçek ürünü deterministik geometri kodu, doğrulama raporu ve fiziksel benchmarktır.

- **OpenCode:** yerel yürütme ve agent orkestrasyonu,
- **DeepSeek:** düşük maliyetli repo tarama, uygulama, test üretimi ve karşılaştırmalı inceleme,
- **Claude Code:** bağımsız mimari/güvenlik/üretilebilirlik incelemesi,
- **otomatik testler:** yazılım doğruluğunun asgari kapısı,
- **P1S / A1 mini / UV fiziksel testi:** üretim iddiasının nihai kapısı.

## Güvenlik

- API anahtarları Git'e yazılmaz.
- DeepSeek kimliği OpenCode `/connect` veya kullanıcının güvenli yerel credential deposu üzerinden tanımlanır.
- Claude oturumu kendi hesap/credential mekanizmasını kullanır.
- Agent'lara production Supabase service-role, ödeme, Vercel deploy veya DNS yetkisi verilmez.
- İncelenecek kullanıcı fotoğrafları ve ticari dosyalar dış modele gönderilmeden önce veri politikası ayrıca değerlendirilir.

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

### OpenCode

OpenCode, proje kökündeki `AGENTS.md` dosyasını ve `.opencode/agents/` altındaki uzman agent'ları kullanır:

- `@relief-plan`: salt okunur plan,
- `@relief-builder`: sınırlı uygulama,
- `@relief-reviewer`: bağımsız salt okunur inceleme.

OpenCode'da seçilen provider/model yerel bağlantıya göre değişebilir. Proje yapılandırmasında API anahtarı veya zorunlu model kimliği sabitlenmez.

## Zorunlu çalışma sırası

1. GitHub issue ve kabul kriterlerini oku.
2. `@relief-plan` ile sadece plan çıkar.
3. Planı insan gözüyle kontrol et.
4. `@relief-builder` ile tek küçük vertical slice uygula.
5. Unit/integration testlerini çalıştır.
6. Farklı model/provider kullanan `@relief-reviewer` veya Claude `relief-reviewer` ile diff incele.
7. Blocker/high bulguları düzelt.
8. Aynı testleri tekrar çalıştır.
9. Sonucu issue'ya ölçümlerle kaydet.
10. Fiziksel iddia varsa fiziksel benchmark tamamlanmadan işi kapatma.

## Model bağımsız doğrulama matrisi

| Alan | Uygulayıcı | Bağımsız reviewer | Nesnel kapı |
|---|---|---|---|
| Relief CLI | DeepSeek/OpenCode | Claude veya farklı DeepSeek oturumu | pytest + mesh ölçümleri |
| Next.js API | OpenCode | Claude | type-check + test + auth testleri |
| DB migration | OpenCode | Claude | dry-run/staging + RLS kontrolü |
| UV export | DeepSeek/OpenCode | Claude | pixel/mm registration testi |
| 3MF export | OpenCode | Claude | lib3mf validation + slicer açılışı |
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
- Relief Pro ile Dome'u aynı ürün gibi gösterme.

## İlk kullanım senaryosu

Issue #54 için önerilen sıra:

1. DeepSeek/OpenCode `relief-plan`: mevcut `workers/relief` kodu ve testlerini incele, eksik invariants listesini çıkar.
2. DeepSeek/OpenCode `relief-builder`: yalnızca en yüksek öncelikli bir eksikliği uygula.
3. Claude `relief-reviewer`: diff, determinism, units ve topology incelemesi.
4. `pytest` ve örnek build çıktıları.
5. Sonuçları Issue #54'e ekle.

## Başarı ölçütü

Agent kullanımı ancak şu etkileri sağlıyorsa başarılıdır:

- daha küçük ve denetlenebilir commitler,
- daha yüksek test kapsamı,
- daha az geriye dönük hata,
- kararların issue ve ölçümlere bağlanması,
- insan müdahalesi gereken fiziksel konuların açıkça ayrılması.

Daha fazla kod üretmek tek başına başarı değildir.
