/* Manuel sahne yerleştirme: ürünü sürükle/boyutlandır/döndür, hazır zeminle birleştir, PNG/JPG indir.
   Tek dosyalık demoyla eşit porttur. Piksel işlemi ve indirme tamamen tarayıcıdadır;
   sunucuya istek atılmaz, AI kredisi harcanmaz. İndirme üyelik kapısının arkasındadır. */
export type ComposerFormat = 'square' | 'portrait' | 'landscape';
export const COMPOSER_FORMATS: Record<ComposerFormat, [number, number]> = {
  square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080],
};
export interface ComposerOptions {
  sampleProduct: string;
  verifyMember?: () => Promise<boolean>;
  loginUrl?: string;
  allowDemoMembership?: boolean;
}
export interface ManualComposer { open(source?: string, label?: string): void; close(): void; dispose(): void }
interface Placement { x: number; y: number; scale: number; rotation: number }
const finiteClamp = (v: number, low: number, high: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback;
export function normalizePlacement(p: Placement): Placement {
  return {
    x: finiteClamp(p.x, 0, 1, 0.5), y: finiteClamp(p.y, 0, 1, 0.5),
    scale: finiteClamp(p.scale, 0.08, 1.65, 0.65), rotation: finiteClamp(p.rotation, -180, 180, 0),
  };
}
export function fitRect(sw: number, sh: number, dw: number, dh: number, mode: string): {x: number; y: number; width: number; height: number} {
  if (![sw, sh, dw, dh].every(v => Number.isFinite(v) && v > 0)) throw Error('Geçersiz görsel boyutu.');
  const s = mode === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  return {x: (dw - sw * s) / 2, y: (dh - sh * s) / 2, width: sw * s, height: sh * s};
}
export function validateCompositionFile(file: File): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw Error('Yalnız JPG, PNG veya WebP yükleyebilirsin. SVG kabul edilmez.');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 10 * 1024 * 1024)
    throw Error('Görsel 0–10 MB aralığında olmalı.');
}
const isComposerFormat = (v: string): v is ComposerFormat => v === 'square' || v === 'portrait' || v === 'landscape';
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, s => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[s]!));
export function createManualComposer(host: HTMLElement, options: ComposerOptions): ManualComposer {
  const doc = host.ownerDocument, win = doc.defaultView as Window;
  let dialog: HTMLDialogElement | null = null, canvas: HTMLCanvasElement | null = null;
  let dead = false, product: HTMLCanvasElement | null = null, background: HTMLCanvasElement | null = null;
  let productName = 'Hazır şişe (temsili)', backgroundName = '', sourceKey = '';
  let loadP = 0, loadB = 0, view = 0, exporting = false, memberDemo = false;
  let p: Placement = {x: 0.5, y: 0.55, scale: 0.68, rotation: 0};
  let format: ComposerFormat = 'square', bgMode = 'cover';
  let preset = 'studio', solid = '#eee8e0', shadow = false;
  let returnFocus: Element | null = null, previousOverflow = '';
  let pointer: {id: number; mode: 'size' | 'move'; startX: number; startY: number; p: Placement; radius: number} | null = null;
  const notice = 'Ürünü sürükle; köşelerinden boyutlandır. Görseller bu sayfadan sunucuya gönderilmez.';
  const q = <T extends Element = HTMLElement>(sel: string): T | null => dialog?.querySelector<T>(sel) ?? null;
  const dimensions = (): [number, number] => COMPOSER_FORMATS[format];
  function status(s: string, error = false): void {
    const el = q('#mc-status');
    if (el) { el.textContent = s; el.classList.toggle('mc-error', error); }
  }
  function modelSize(w: number, h: number): [number, number] {
    if (!product) return [0, 0];
    const f = Math.min(w / product.width, h / product.height) * p.scale;
    return [product.width * f, product.height * f];
  }
  function draw(to: HTMLCanvasElement, selected: boolean): void {
    const ctx = to.getContext('2d');
    if (!ctx) throw Error('Tarayıcı çizim alanını açamadı.');
    const [w, h] = [to.width, to.height];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = solid;
    ctx.fillRect(0, 0, w, h);
    if (background) {
      const r = fitRect(background.width, background.height, w, h, bgMode);
      ctx.drawImage(background, r.x, r.y, r.width, r.height);
    } else if (preset !== 'solid') {
      // Hazır zeminler prosedürel stüdyo çizimidir; fotoğraf veya AI sahnesi değildir.
      const g = ctx.createLinearGradient(0, 0, 0, h);
      if (preset === 'lavender') { g.addColorStop(0, '#e3dcf4'); g.addColorStop(0.7, '#f8f5ff'); g.addColorStop(1, '#d5c6ef'); }
      else if (preset === 'night') { g.addColorStop(0, '#11172a'); g.addColorStop(0.72, '#323958'); g.addColorStop(1, '#151b31'); }
      else { g.addColorStop(0, '#e9dfd1'); g.addColorStop(0.69, '#faf6ed'); g.addColorStop(1, '#d1baa0'); }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = preset === 'night' ? '#ffffff08' : '#ffffff45';
      ctx.fillRect(0, h * 0.76, w, h * 0.24);
    }
    if (!product) return;
    const [pw, ph] = modelSize(w, h), cx = p.x * w, cy = p.y * h;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p.rotation * Math.PI / 180);
    if (shadow) {
      ctx.save();
      ctx.translate(pw * 0.04, ph * 0.46);
      ctx.scale(1, 0.19);
      const r = ctx.createRadialGradient(0, 0, 0, 0, 0, pw * 0.5);
      r.addColorStop(0, 'rgba(0,0,0,.28)');
      r.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = r;
      ctx.beginPath();
      ctx.arc(0, 0, pw * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(product, -pw / 2, -ph / 2, pw, ph);
    if (selected) {
      const u = w / 800;
      ctx.strokeStyle = '#7351ed';
      ctx.lineWidth = 1.7 * u;
      ctx.setLineDash([6 * u, 4 * u]);
      ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.setLineDash([]);
      for (const x of [-pw / 2, pw / 2])
        for (const y of [-ph / 2, ph / 2]) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x - 5 * u, y - 5 * u, 10 * u, 10 * u);
          ctx.strokeRect(x - 5 * u, y - 5 * u, 10 * u, 10 * u);
        }
    }
    ctx.restore();
  }
  function refresh(): void {
    if (!canvas) return;
    try { draw(canvas, true); }
    catch (e) { status(e instanceof Error ? e.message : 'Önizleme çizilemedi.', true); }
    for (const key of ['x', 'y', 'scale', 'rotation'] as const) {
      const el = q<HTMLInputElement>(`#mc-${key}`);
      const v = key === 'rotation' ? Math.round(p[key]) : Math.round(p[key] * 100);
      if (el) el.value = String(v);
      const out = q(`#mc-${key}-value`);
      if (out) out.textContent = String(v) + (key === 'rotation' ? '°' : '%');
    }
    const [w, h] = dimensions();
    const size = q('#mc-output-size');
    if (size) size.textContent = `${w} × ${h} px`;
    const name = q('#mc-product-name');
    if (name) name.textContent = productName;
    const bg = q('#mc-background-name');
    if (bg) bg.textContent = background ? backgroundName : 'Hazır stüdyo zemini · çizim, AI değil';
    dialog?.querySelectorAll('[data-mc-preset]').forEach(b => b.setAttribute('aria-pressed', String(!background && (b as HTMLElement).dataset.mcPreset === preset)));
    dialog?.querySelectorAll('[data-mc-export]').forEach(b => { (b as HTMLButtonElement).disabled = !product || exporting; });
  }
  function updateSize(): void {
    if (!canvas) return;
    const [w, h] = dimensions();
    canvas.width = 800;
    canvas.height = Math.round(800 * h / w);
    refresh();
  }
  async function imageCanvas(src: string, trim: boolean): Promise<HTMLCanvasElement> {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      const timer = win.setTimeout(() => reject(Error('Görsel yükleme süresi doldu.')), 15000);
      img.onload = () => { win.clearTimeout(timer); resolve(); };
      img.onerror = () => { win.clearTimeout(timer); reject(Error('Görsel açılamadı veya çapraz kaynak izni yok.')); };
      img.src = src;
    });
    if (img.naturalWidth * img.naturalHeight > 24_000_000) throw Error('En fazla 24 megapiksel görsel kullan.');
    const factor = Math.min(1, 2500 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = doc.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * factor));
    c.height = Math.max(1, Math.round(img.naturalHeight * factor));
    const ctx = c.getContext('2d', {willReadFrequently: trim});
    if (!ctx) throw Error('Canvas kullanılamıyor.');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // Pikseli okumak canvasın dışa aktarılabilir olduğunu kanıtlar ve gerçek alfayı bulur.
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    if (!trim) return c;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 12) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
    if (x1 < 0) throw Error('Görsel tamamen saydam; yerleştirilecek ürün yok.');
    if (x0 === 0 && y0 === 0 && x1 === c.width - 1 && y1 === c.height - 1) return c;
    const crop = doc.createElement('canvas');
    crop.width = x1 - x0 + 1;
    crop.height = y1 - y0 + 1;
    crop.getContext('2d')?.drawImage(c, x0, y0, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return crop;
  }
  async function setProduct(src: string, label: string): Promise<void> {
    const id = ++loadP;
    product = null;
    refresh();
    status('Ürün yükleniyor…');
    try {
      const c = await imageCanvas(src, true);
      if (dead || id !== loadP) return;
      product = c;
      productName = label;
      p = {x: 0.5, y: 0.55, scale: 0.68, rotation: 0};
      status('Ürün hazır. Kendi arka planını yükleyebilir veya hazır zemini seçebilirsin.');
      refresh();
    } catch (e) {
      if (!dead && id === loadP) {
        sourceKey = '';
        status(e instanceof Error ? e.message : 'Ürün açılamadı.', true);
        refresh();
      }
    }
  }
  async function chooseFile(file: File, kind: 'product' | 'background'): Promise<void> {
    const id = kind === 'product' ? ++loadP : ++loadB;
    let url = '';
    try {
      validateCompositionFile(file);
      url = URL.createObjectURL(file);
      const c = await imageCanvas(url, kind === 'product');
      if (dead || (kind === 'product' ? id !== loadP : id !== loadB)) return;
      if (kind === 'product') {
        product = c;
        productName = file.name;
        p = {x: 0.5, y: 0.55, scale: 0.68, rotation: 0};
      } else {
        background = c;
        backgroundName = file.name;
      }
      status(kind === 'product' ? 'Ürün yüklendi. Arka planını otomatik silmedik; en iyi sonuç için dekupe PNG kullan.' : 'Kendi arka planın yüklendi. Ürünü sürükleyerek konumlandır.');
      refresh();
    } catch (e) {
      if (!dead) status(e instanceof Error ? e.message : 'Dosya açılamadı.', true);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  function openGate(): void {
    const gate = q('#mc-member');
    if (!gate) return;
    gate.hidden = false;
    const text = q('#mc-member-info');
    if (text) text.textContent = options.allowDemoMembership ? 'Bu dosya gerçek hesap açmaz. Aşağıdaki düğme yalnız demo üyelik adımını taklit eder; bilgi toplamaz.' : 'Manuel yerleştirme ücretsizdir. PNG/JPG indirmek için Renderhane hesabına giriş yap. Bu sekmeyi kapatma; taslağın bellekte kalır.';
    q('#mc-member-close')?.focus();
  }
  async function authorized(): Promise<boolean> {
    if (options.verifyMember) {
      try { return await options.verifyMember(); } catch { return false; }
    }
    return options.allowDemoMembership === true && memberDemo;
  }
  async function save(kind: 'png' | 'jpeg'): Promise<void> {
    if (exporting || !product) return;
    exporting = true;
    refresh();
    const thisView = view;
    try {
      if (!await authorized()) {
        if (dialog && view === thisView) {
          openGate();
          status('Ücretsiz indirme için üyelik gerekli.');
        }
        return;
      }
      if (dead || !dialog || thisView !== view) return;
      const c = doc.createElement('canvas');
      [c.width, c.height] = dimensions();
      draw(c, false);
      const b = await new Promise<Blob>((resolve, reject) => c.toBlob(bb => bb ? resolve(bb) : reject(Error('Çıktı oluşturulamadı.')), 'image/' + kind, 0.94));
      if (dead || !dialog || view !== thisView) return;
      const a = doc.createElement('a');
      const url = URL.createObjectURL(b);
      a.href = url;
      a.download = `Renderhane_Kompozisyon_${c.width}x${c.height}.${kind === 'jpeg' ? 'jpg' : 'png'}`;
      a.click();
      win.setTimeout(() => URL.revokeObjectURL(url), 3000);
      status(options.verifyMember ? 'Kompozisyon indirildi. AI kredisi kullanılmadı.' : 'Kompozisyon indirildi · demo üyelik onayı kullanıldı. Gerçek hesap oluşturulmadı.');
    } catch (e) {
      if (!dead) status(e instanceof Error ? e.message : 'İndirme tamamlanamadı.', true);
    } finally {
      exporting = false;
      refresh();
    }
  }
  function point(e: PointerEvent): [number, number] {
    const r = (canvas as HTMLCanvasElement).getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas as HTMLCanvasElement).width / r.width, (e.clientY - r.top) * (canvas as HTMLCanvasElement).height / r.height];
  }
  function pointerDown(e: PointerEvent): void {
    if (!canvas || !product || pointer || e.button !== 0) return;
    const [x, y] = point(e), [pw, ph] = modelSize(canvas.width, canvas.height);
    const dx = x - p.x * canvas.width, dy = y - p.y * canvas.height;
    const a = -p.rotation * Math.PI / 180, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    const tolerance = 22 * canvas.width / canvas.getBoundingClientRect().width;
    const corner = Math.abs(Math.abs(lx) - pw / 2) < tolerance && Math.abs(Math.abs(ly) - ph / 2) < tolerance;
    if (!corner && (Math.abs(lx) > pw / 2 || Math.abs(ly) > ph / 2)) return;
    e.preventDefault();
    canvas.focus({preventScroll: true});
    canvas.setPointerCapture(e.pointerId);
    pointer = {id: e.pointerId, mode: corner ? 'size' : 'move', startX: x, startY: y, p: {...p}, radius: Math.max(1, Math.hypot(dx, dy))};
  }
  function pointerMove(e: PointerEvent): void {
    if (!pointer || e.pointerId !== pointer.id || !canvas) return;
    e.preventDefault();
    const [x, y] = point(e);
    if (pointer.mode === 'move')
      p = normalizePlacement({...p, x: pointer.p.x + (x - pointer.startX) / canvas.width, y: pointer.p.y + (y - pointer.startY) / canvas.height});
    else
      p = normalizePlacement({...p, scale: pointer.p.scale * Math.hypot(x - pointer.p.x * canvas.width, y - pointer.p.y * canvas.height) / pointer.radius});
    refresh();
  }
  function pointerUp(e: PointerEvent): void {
    if (pointer?.id === e.pointerId) {
      if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      pointer = null;
    }
  }
  function key(e: KeyboardEvent): void {
    if (e.target !== canvas) return;
    const delta = e.shiftKey ? 0.02 : 0.005;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      p = normalizePlacement({...p, x: p.x + (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0), y: p.y + (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0)});
      refresh();
    }
  }
  function click(e: Event): void {
    const b = (e.target as Element).closest<HTMLElement>('[data-mc-action],[data-mc-preset],[data-mc-export]');
    if (!b || !dialog?.contains(b)) return;
    if (b instanceof HTMLButtonElement && b.disabled) return;
    e.preventDefault();
    if (b.dataset.mcExport === 'png' || b.dataset.mcExport === 'jpeg') { void save(b.dataset.mcExport); return; }
    if (b.dataset.mcPreset) {
      loadB++;
      background = null;
      backgroundName = '';
      preset = b.dataset.mcPreset;
      refresh();
      return;
    }
    switch (b.dataset.mcAction) {
      case 'close': close(); break;
      case 'center': p = {...p, x: 0.5, y: 0.5}; refresh(); break;
      case 'reset': p = {x: 0.5, y: 0.55, scale: 0.68, rotation: 0}; refresh(); break;
      case 'clear-bg': loadB++; background = null; backgroundName = ''; refresh(); break;
      case 'member-close': { const g = q('#mc-member'); if (g) g.hidden = true; break; }
      case 'demo-member':
        if (options.allowDemoMembership && !options.verifyMember) {
          memberDemo = true;
          const g = q('#mc-member');
          if (g) g.hidden = true;
          status('Demo üyelik adımı tamamlandı. Şimdi PNG veya JPG indir. Gerçek hesap açılmadı.');
        }
        break;
      case 'check-member':
        void authorized().then(ok => {
          if (!dialog) return;
          if (ok) {
            const g = q('#mc-member');
            if (g) g.hidden = true;
            status('Giriş doğrulandı. Çıktını indirebilirsin.');
          } else status('Oturum doğrulanamadı. Girişten sonra yeniden dene.', true);
        });
        break;
    }
  }
  function input(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (!el) return;
    const place = el.dataset.mcPlace;
    if (place === 'x' || place === 'y' || place === 'scale' || place === 'rotation') {
      p = normalizePlacement({...p, [place]: Number(el.value) / (place === 'rotation' ? 1 : 100)});
      refresh();
    }
    if (el.id === 'mc-color') {
      solid = el.value;
      preset = 'solid';
      background = null;
      loadB++;
      refresh();
    }
    if (el.id === 'mc-shadow') {
      shadow = el.checked;
      refresh();
    }
  }
  function change(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.dataset.mcFile && el.files?.[0]) {
      void chooseFile(el.files[0], el.dataset.mcFile === 'background' ? 'background' : 'product');
      el.value = '';
      return;
    }
    if (el.id === 'mc-format' && isComposerFormat(el.value)) {
      format = el.value;
      updateSize();
    }
    if (el.id === 'mc-fit' && (el.value === 'cover' || el.value === 'contain')) {
      bgMode = el.value;
      refresh();
    }
  }
  function cancel(e: Event): void { e.preventDefault(); close(); }
  function close(): void {
    if (!dialog) return;
    view++;
    pointer = null;
    dialog.close();
    dialog.remove();
    dialog = null;
    canvas = null;
    doc.body.style.overflow = previousOverflow;
    if (returnFocus?.isConnected) (returnFocus as HTMLElement).focus?.({preventScroll: true});
  }
  function open(source: string = options.sampleProduct, label = 'Hazır şişe (temsili)'): void {
    if (dead || dialog) return;
    returnFocus = doc.activeElement;
    previousOverflow = doc.body.style.overflow;
    dialog = doc.createElement('dialog');
    dialog.className = 'mc-dialog';
    dialog.setAttribute('aria-labelledby', 'mc-title');
    dialog.innerHTML = `<header class="mc-head"><div><span class="mc-kicker">ÜCRETSİZ MANUEL YERLEŞTİRME</span><h2 id="mc-title">Ürününü sahneye yerleştir.</h2><p>Kendi arka planın. Kendi kompozisyonun. AI kredisi harcanmaz.</p></div><button type="button" class="mc-close" data-mc-action="close" aria-label="Düzenleyiciyi kapat">×</button></header>
      <div class="mc-body"><section class="mc-stage-wrap"><div class="mc-stage-top"><span>ÖNİZLEME</span><strong id="mc-output-size"></strong><span class="mc-badge">İndirme: ücretsiz üyelik</span></div><div class="mc-stage"><canvas id="mc-canvas" tabindex="0" role="img" aria-label="Ürün kompozisyonu. Ürünü sürükleyin, köşelerden boyutlandırın. Ok tuşlarıyla taşıyabilirsiniz."></canvas></div><div class="mc-stage-bottom"><span>↔ Sürükle / köşelerden ölçekle</span><button type="button" data-mc-action="center">Ortala</button><button type="button" data-mc-action="reset">Konumu sıfırla</button></div><p id="mc-status" role="status" aria-live="polite"></p><p class="mc-disclaimer">Manuel kompozisyon; otomatik dekupe, perspektif veya AI ışık uyumu uygulanmaz. Gölge seçeneği basit çizimdir. Taslak bu sekmenin belleğinde tutulur; sayfa yenilenirse kaybolur.</p></section>
      <aside class="mc-controls"><section><h3>01 <span>Ürün görseli</span></h3><label class="mc-upload">Dekupe ürün yükle<input type="file" data-mc-file="product" accept="image/png,image/jpeg,image/webp" aria-label="Kompozisyon için ürün görseli yükle"></label><p id="mc-product-name" class="mc-file-name"></p><small>Saydam PNG önerilir. JPG ve WebP de yüklenebilir; arka planı otomatik silinmez.</small></section>
      <section><h3>02 <span>Arka plan</span></h3><label class="mc-upload mc-upload-primary">Kendi arka planını yükle<input type="file" data-mc-file="background" accept="image/png,image/jpeg,image/webp" aria-label="Kendi arka planını yükle"></label><p id="mc-background-name" class="mc-file-name"></p><div class="mc-presets">${[['studio', 'Sıcak stüdyo'], ['lavender', 'Lavanta'], ['night', 'Gece']].map(([k, v]) => `<button type="button" data-mc-preset="${k}" class="mc-preset-${k}">${v}</button>`).join('')}</div><div class="mc-field-row"><label>Düz renk<input id="mc-color" type="color" value="${esc(solid)}" aria-label="Düz arka plan rengi"></label><label>Yerleşim<select id="mc-fit"><option value="cover">Alanı doldur (kırp)</option><option value="contain">Görselin tamamı</option></select></label></div><button class="mc-text-button" type="button" data-mc-action="clear-bg">Yüklenen arka planı kaldır</button><small>Dosyalar en fazla 10 MB / 24 MP. Uzun kenar 2500 px üzerinde çalışma kopyası küçültülür.</small></section>
      <section><h3>03 <span>Konum ve boyut</span></h3>${([['x', 'Yatay konum', 0, 100], ['y', 'Dikey konum', 0, 100], ['scale', 'Ürün boyutu', 8, 165], ['rotation', 'Döndürme', -180, 180]] as Array<[string, string, number, number]>).map(([k, v, min, max]) => `<label class="mc-range-label" for="mc-${k}">${v}<output id="mc-${k}-value"></output></label><input id="mc-${k}" data-mc-place="${k}" type="range" min="${min}" max="${max}" step="1">`).join('')}<label class="mc-check"><input id="mc-shadow" type="checkbox" ${shadow ? 'checked' : ''}>Basit temas gölgesi (AI değil)</label></section>
      <section><h3>04 <span>Çıktı</span></h3><label class="mc-format-label" for="mc-format">Görsel oranı</label><select id="mc-format"><option value="square">Kare · 1080 × 1080</option><option value="portrait">Dikey · 1080 × 1350</option><option value="landscape">Yatay · 1920 × 1080</option></select><div class="mc-export-row"><button type="button" data-mc-export="png" class="mc-primary">PNG indir</button><button type="button" data-mc-export="jpeg">JPG indir</button></div><small>Ücretsiz üyelik gerekir. Manuel işlemden AI kredisi düşülmez.</small></section></aside></div>
      <section id="mc-member" class="mc-member" hidden aria-labelledby="mc-member-title"><div><button type="button" data-mc-action="member-close" id="mc-member-close" class="mc-close" aria-label="Üyelik açıklamasını kapat">×</button><span class="mc-kicker">ÜCRETSİZ + ÜYELİKLİ</span><h3 id="mc-member-title">Kompozisyonun hazır.</h3><p id="mc-member-info"></p><div id="mc-member-actions"></div><small>Giriş için ayrı sekme açılır. Taslağı korumak için bu sekmeyi açık tut.</small></div></section>`;
    const controls = q<HTMLElement>('.mc-controls');
    const body = q<HTMLElement>('.mc-body');
    const panels = Array.from(controls?.children ?? []) as HTMLElement[];
    const panelNames = ['product', 'background', 'position', 'export'] as const;
    panels.forEach((panel, index) => {
      panel.dataset.mcPanel = panelNames[index];
      panel.id = `mc-panel-${panelNames[index]}`;
    });
    const mobileTabs = doc.createElement('div');
    mobileTabs.className = 'mc-mobile-tabs';
    mobileTabs.setAttribute('role', 'tablist');
    mobileTabs.setAttribute('aria-label', 'Sahne düzenleme adımları');
    mobileTabs.innerHTML = [
      ['product', 'Ürün'], ['background', 'Arka plan'], ['position', 'Konum'], ['export', 'İndir'],
    ].map(([panel, label], index) => `<button type="button" role="tab" data-mc-tab="${panel}" aria-controls="mc-panel-${panel}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${label}</button>`).join('');
    body?.insertBefore(mobileTabs, controls ?? null);
    dialog.dataset.mobilePanel = 'product';
    mobileTabs.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-mc-tab]');
      if (!button || !dialog) return;
      dialog.dataset.mobilePanel = button.dataset.mcTab || 'product';
      mobileTabs.querySelectorAll<HTMLButtonElement>('[data-mc-tab]').forEach(tab => {
        const active = tab === button;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      button.focus({preventScroll: true});
    });
    host.append(dialog);
    canvas = q<HTMLCanvasElement>('#mc-canvas');
    const actions = q('#mc-member-actions');
    if (options.allowDemoMembership && !options.verifyMember) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'mc-primary';
      b.dataset.mcAction = 'demo-member';
      b.textContent = 'Demo üyelik adımını dene';
      actions?.append(b);
    } else {
      const raw = options.loginUrl || '/tr/login';
      let url: URL | null = null;
      try { url = new URL(raw, win.location.href); } catch { /* göreli ya da geçersiz URL: giriş bağlantısı kurulmaz */ }
      if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
        const a = doc.createElement('a');
        a.className = 'mc-primary';
        a.href = url.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Ücretsiz giriş / kayıt';
        actions?.append(a);
      }
      const b = doc.createElement('button');
      b.type = 'button';
      b.dataset.mcAction = 'check-member';
      b.textContent = 'Giriş yaptım, kontrol et';
      actions?.append(b);
    }
    dialog.addEventListener('click', click);
    dialog.addEventListener('input', input);
    dialog.addEventListener('change', change);
    dialog.addEventListener('cancel', cancel);
    canvas?.addEventListener('pointerdown', pointerDown);
    canvas?.addEventListener('pointermove', pointerMove);
    canvas?.addEventListener('pointerup', pointerUp);
    canvas?.addEventListener('pointercancel', pointerUp);
    canvas?.addEventListener('lostpointercapture', pointerUp);
    canvas?.addEventListener('keydown', key);
    const formatEl = q<HTMLSelectElement>('#mc-format');
    if (formatEl) formatEl.value = format;
    const fitEl = q<HTMLSelectElement>('#mc-fit');
    if (fitEl) fitEl.value = bgMode;
    dialog.showModal();
    doc.body.style.overflow = 'hidden';
    updateSize();
    status(notice);
    if (!product || sourceKey !== source) {
      sourceKey = source;
      void setProduct(source, label);
    } else refresh();
  }
  return {open, close, dispose: () => { dead = true; loadP++; loadB++; close(); product = null; background = null; }};
}
