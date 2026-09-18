/**
 * Renderhane UI / framework-independent TypeScript, mounted through a React bridge when needed.
 * No API request is made unless a host explicitly supplies an adapter.
 * Inputs stay in memory. Demo image composites are not live AI outputs.
 */
import './vendor/qr-core.js';
import {IDEA_CATEGORIES, getInspirationIdea, renderInspiration, validateIdeaUrl, type IdeaChannel, type InspirationState} from './inspiration';
import {createManualComposer, type ManualComposer} from './composer';

export type Page = 'home' | 'background' | 'scenes' | 'qr' | 'nfc' | 'artistic' | 'tools';
export type ContentType = 'url' | 'vcard' | 'wifi' | 'phone' | 'email' | 'sms' | 'location' | 'text' | 'app';
export type Fields = Record<string, string>;
export interface ImageResult { url: string; remaining?: number }
export interface SceneResult { url: string; label: string }
export interface RenderhaneAdapters {
  removeBackground?: (file: File, signal: AbortSignal) => Promise<ImageResult>;
  generateScenes?: (file: File, prompt: string, signal: AbortSignal) => Promise<SceneResult[]>;
}
export interface MountOptions {
  initialPage?: Page;
  /** Optional host chrome. Omitted values preserve V3's original behavior. */
  chrome?: boolean;
  homeMarkup?: string;
  headerMarkup?: string;
  footerMarkup?: string;
  pageHref?: (page: Page) => string;
  onAnchor?: (anchor: string) => void;
  onRender?: (page: Page) => (() => void) | void;
  assetBase?: string;
  /** A map of image data URLs lets the preview work from file:// without a server. */
  assets?: Record<string, string>;
  adapters?: RenderhaneAdapters;
  onNavigate?: (page: Page) => void;
  /** Disable the preview banner only after integrating the actual production services. */
  preview?: boolean;
  /** Uyelik dogrulamasi baglanmadan composer indirimi kapali kalir. */
  verifyComposerMember?: () => Promise<boolean>;
  composerLoginUrl?: string;
  demoComposerMembership?: boolean;
}
interface QRModel { addData(v: string): void; addUtf8Eci(): void; make(): void; getModuleCount(): number; isDark(r: number, c: number): boolean }
interface QrRsBlock { totalCount: number; dataCount: number }
interface QrTools {
  rsBlocks(v: number, l: number): QrRsBlock[];
  functionGrid(v: number, l: number, m: number): (boolean | null)[][];
}
interface NFCRecord { recordType: string; mediaType?: string; lang?: string; data: string | Uint8Array }
interface NFCEvent { message: { records: Array<{ recordType: string; data: DataView; encoding?: string }> } }
interface NFCReaderInstance {
  write(message: { records: NFCRecord[] }, options: { signal: AbortSignal; overwrite: boolean }): Promise<void>;
  scan(options: { signal: AbortSignal }): Promise<void>;
  onreading: ((event: NFCEvent) => void) | null;
  onreadingerror: (() => void) | null;
}
// Local browser shape, not a global Window declaration: avoids colliding with
// the host project's existing NFC/QR typings when the preview is installed.
type ToolWindow = Window & {
  LocalQR: new (version: number, level: number) => QRModel;
  LocalQRTools: QrTools;
  NDEFReader?: new () => NFCReaderInstance;
};
const MAX_FILE = 5 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const pages: Page[] = ['home', 'background', 'scenes', 'qr', 'nfc', 'artistic', 'tools'];
const pageNames: Record<Page, string> = { home: 'Ana sayfa', background: 'Arka plan kaldır', scenes: 'Sahne oluştur', qr: 'QR kod oluştur', nfc: 'NFC etiket yaz', artistic: 'Sanatsal QR', tools: 'Tüm araçlar' };
const contentLabels: Record<ContentType, string> = { url: 'URL', vcard: 'Kişi kartı', wifi: 'WiFi', phone: 'Telefon', email: 'E-posta', sms: 'SMS', location: 'Konum', text: 'Metin', app: 'Uygulama' };
const contentIcons: Record<ContentType, string> = { url: 'link', vcard: 'user', wifi: 'wifi', phone: 'phone', email: 'mail', sms: 'message', location: 'pin', text: 'text', app: 'grid' };
const sceneNames = ['Doğal ışık', 'Minimal stüdyo', 'Banyo', 'Pazaryeri'];
const scenePrompts = [
  'Ürünü doğal ışık alan, sıcak bej bir stüdyo yüzeyinde göster. Ürünün şeklini ve rengini koru.',
  'Ürünü açık bej bir zeminde, taş kaidelerle minimal bir stüdyoda göster.',
  'Ürünü sade bir banyo rafında, havlu ve doğal ışık ile göster.',
  'Ürünü beyaz bir pazaryeri zemininde, kontrollü ve yumuşak ışıkla göster.',
];
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]!));
const iconPaths: Record<string, string> = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', chevron: '<path d="m8 10 4 4 4-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.4"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  eraser: '<path d="m14 3 7 7-11 11H5l-3-3L14 3Zm-8 9 7 7M11 21h10"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  qr: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3m-6 3v-3m6-6v3"/>',
  nfc: '<path d="M5 5a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8"/><rect x="10.5" y="9" width="3" height="6" rx="1"/>',
  box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10M7.5 4.5l9 5"/>',
  shield: '<path d="M12 3 3 7v5c0 6 9 10 9 10s9-4 9-10V7l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>', upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m3 4a6 6 0 0 1 3 5v2"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  message: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 4V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10Z"/>',
  wifi: '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  text: '<path d="M6 2h9l5 5v15H4V2h2Zm8 0v6h6M8 12h8M8 16h8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  infinity: '<path d="M12 12c-3-5-9-6-9 0s6 5 9 0 9-6 9 0-6 5-9 0Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-9-9"/>',
  scan: '<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M3 12h18"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  coffee: '<path d="M3 8h13v7a6.5 6.5 0 0 1-13 0V8Zm13 0h2a3 3 0 0 1 0 6h-2M6 2v3m5-3v3M2 22h17"/>',
};
function icon(name: string, extra = ''): string { return `<svg class="rh-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.image}</svg>`; }
function btn(label: string, action: string, primary = false, ico = 'arrow', extra = ''): string { return `<button type="button" class="rh-btn ${primary ? 'rh-btn-primary' : ''}" data-action="${action}" ${extra}>${ico ? icon(ico) : ''}${label}</button>`; }
function validHttp(v: string): string { const raw = v.trim(); if (!raw) throw Error('Web adresini girin.'); let u: URL; try { u = new URL(raw); } catch { throw Error('http:// veya https:// ile başlayan geçerli bir adres girin.'); } if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password) throw Error('Yalnızca kimlik bilgisi içermeyen HTTP/HTTPS adresleri destekleniyor.'); return u.href; }
const wifiEscape = (v: string): string => v.replace(/[\\;,:"']/g, c => '\\' + c);
const vcardEscape = (v: string): string => v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function requireField(f: Fields, key: string, label: string): string { const value = (f[key] || '').trim(); if (!value) throw Error(label + ' alanını doldurun.'); return value; }
/** Payloads for ordinary static QR codes, not redirects or dynamic analytics. */
export function buildPayload(type: ContentType, f: Fields): string {
  const phone = (): string => { const v = requireField(f, 'phone', 'Telefon').replace(/[\s()-]/g, ''); if (!/^\+?[0-9]{5,15}$/.test(v)) throw Error('Telefon numarasını ülke koduyla girin.'); return v; };
  switch (type) {
    case 'url': return validHttp(f.url || '');
    case 'vcard': {
      const name = requireField(f, 'name', 'Ad soyad');
      return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vcardEscape(name)}`, `N:;${vcardEscape(name)};;;`, f.phone ? `TEL:${phone()}` : '', f.email ? `EMAIL:${vcardEscape(f.email)}` : '', f.org ? `ORG:${vcardEscape(f.org)}` : '', f.website ? `URL:${validHttp(f.website)}` : '', 'END:VCARD'].filter(Boolean).join('\r\n');
    }
    case 'wifi': {
      const ssid = requireField(f, 'ssid', 'Ağ adı'); const enc = f.encryption || 'WPA';
      if (!['WPA', 'WEP', 'nopass'].includes(enc)) throw Error('Geçersiz şifreleme seçeneği.');
      if (enc !== 'nopass' && !f.password) throw Error('WiFi şifresini girin.');
      return `WIFI:T:${enc};S:${wifiEscape(ssid)};P:${wifiEscape(f.password || '')};H:${f.hidden === 'true' ? 'true' : 'false'};;`;
    }
    case 'phone': return `tel:${phone()}`;
    case 'email': {
      const email = requireField(f, 'email', 'E-posta'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Geçerli bir e-posta adresi girin.');
      const p = new URLSearchParams(); if (f.subject) p.set('subject', f.subject); if (f.body) p.set('body', f.body);
      return `mailto:${email}${p.size ? '?' + p.toString().replace(/\+/g, '%20') : ''}`;
    }
    case 'sms': return `sms:${phone()}${f.body ? '?body=' + encodeURIComponent(f.body) : ''}`;
    case 'location': {
      const lat = Number(requireField(f, 'lat', 'Enlem')), lon = Number(requireField(f, 'lon', 'Boylam'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw Error('Enlem −90…90, boylam −180…180 aralığında olmalı.');
      return `geo:${lat},${lon}`;
    }
    case 'app': { const name = requireField(f, 'package', 'Paket adı'); if (!/^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/.test(name)) throw Error('Geçerli bir Android paket adı girin (ör. com.firma.uygulama).'); return `https://play.google.com/store/apps/details?id=${encodeURIComponent(name)}`; }
    case 'text': return requireField(f, 'text', 'Metin');
  }
}
/** Produces only a local design brief; no QR, order or quote is created. */
export function buildArtisticBrief(fields: Fields): string {
  const brand = requireField(fields,'brand','Marka / proje adı');
  const url = validHttp(fields.url || '');
  if (brand.length > 100 || (fields.notes || '').length > 1500) throw Error('Talep metni çok uzun.');
  return [
    'RENDERHANE — SANATSAL QR / TASARIM TALEBİ',
    'Durum: Yerel taslak. Gönderilmedi; sipariş veya ödeme oluşturulmadı.',
    '', 'Marka: ' + brand, 'Hedef bağlantı: ' + url,
    'Kullanım: ' + (fields.usage || 'Belirtilmedi'),
    'Baskı boyutu: ' + (fields.size || 'Belirtilmedi'),
    'Tasarım yönü: ' + (fields.style || 'Belirtilmedi'),
    'Notlar: ' + (fields.notes || 'Yok'), '',
    'ÖN KOŞULLAR',
    'Fiyat, teslim ve üretim koşulları ayrıca netleştirilmelidir.',
    'Sanatsal örneğin hedef bağlantısı ve taranabilirliği doğrulanmamıştır.',
    'Gerçek üretim: farklı telefon, baskı boyutu, ışık ve mesafede test edilmelidir.',
    'Görsel ve marka kullanım hakları müşteri tarafından doğrulanmalıdır.'
  ].join('\n');
}

import { QR_PRESETS, buildQrArtifact, isQrStyle, presetIcon, validateQrRaster, type QrStyle, type QrValidated } from './qr-artifact';

function imageLoaded(src: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('Görsel açılamadı.')); i.src = src; }); }
function downloadBlob(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Görsel dışa aktarılamadı.')), 'image/png')); }

export function mountRenderhane(root: HTMLElement, options: MountOptions = {}): () => void {
  const doc = root.ownerDocument; const win = doc.defaultView! as unknown as ToolWindow;
  let viewCleanup: (() => void) | undefined;
  let disposed = false; let toastTimer = 0; let qrTimer = 0; let nfcTimer = 0; let uploadTicket = 0;
  let qrRevision = 0; let qrController: AbortController | null = null;
  let qrValidated: QrValidated | null = null; let qrValidatedKey = '';
  // Last key a validation was scheduled/run for. Guards against redundant
  // revalidations (e.g. blur-change carrying the value input already queued):
  // re-running would disable the buttons mid-click and swallow the click.
  let lastQrKey = '';
  let request: AbortController | null = null; let nfcAbort: AbortController | null = null;
  let currentObjectUrl: string | null = null;
  let manualComposer: ManualComposer | null = null;
  const historyEnabled = !options.onNavigate;
  const asset = (name: string): string => options.assets?.[name] || `${options.assetBase ?? './assets'}/${name}`;
  const fromHash = (): Page => { const p = win.location.hash.replace(/^#\/?/, '') as Page; return pages.includes(p) ? p : (options.initialPage || 'home'); };
  const s = {
    page: options.initialPage || fromHash(), menu: false, tools: false, hero: -1, tab: 'compare',
    file: null as File | null, fileUrl: null as string | null, result: null as string | null,
    busy: false, remaining: null as number | null, bgColor: 'transparent', bgMessage: '', bgError: false,
    scenePreset: 0, prompt: scenePrompts[0], scenes: null as SceneResult[] | null,
    qrType: 'url' as ContentType, nfcType: 'url' as ContentType,
    qr: { url: 'https://renderhane.com' } as Fields, nfc: { url: 'https://renderhane.com' } as Fields,
    qrSvg: '', qrPayload: '', qrColor: '#0b0f2d', qrSize: 1024, qrStyle: 'square' as QrStyle, qrError: '', nfcOverwrite: false,
    nfcMessage: '', nfcBusy: false,
    brief: {brand:'',url:'',usage:'Ürün ambalajı',size:'',style:'Çiçek & Ornament',notes:''} as Fields,
    ideas: {qr: {category:'all',expanded:false,selected:null}, nfc: {category:'all',expanded:false,selected:null}} as Record<IdeaChannel, InspirationState>,
  };
  function ideaSection(channel: IdeaChannel): string { return renderInspiration(channel, s.ideas[channel]); }
  function refreshIdeas(focusSelector?: string, scroll = false): void {
    if (s.page !== 'qr' && s.page !== 'nfc') return;
    const section = $('#rh-inspiration');
    if (!section) return;
    section.outerHTML = ideaSection(s.page as IdeaChannel);
    const focus = focusSelector ? $(focusSelector) : null;
    focus?.focus({preventScroll:true});
    if (scroll) (focus as HTMLElement | null)?.scrollIntoView({block:'start'});
  }
  root.classList.add('rh-app');
  const $ = <T extends Element = HTMLElement>(q: string): T | null => root.querySelector<T>(q);
  const $$ = <T extends Element = HTMLElement>(q: string): T[] => Array.from(root.querySelectorAll<T>(q));
  const brand = (): string => `<a href="#home" data-page="home" class="rh-brand" aria-label="Renderhane ana sayfa"><img src="${asset('logo.svg')}" alt="" width="45" height="42"/><span>Renderhane</span></a>`;
  const navlink = (page: Page, label = pageNames[page], cls = ''): string => `<a href="#${page}" data-page="${page}" class="${cls}">${label}</a>`;
  function header(): string {
    const choices: Array<[Page,string,string]> = [['background','eraser','Günde 3 ücretsiz'],['qr','qr','Sınırsız standart QR'],['nfc','nfc','Uyumlu cihazda etiket yazımı']];
    return `<a class="rh-skip" href="#rh-main">İçeriğe geç</a><header class="rh-header"><div class="rh-wrap rh-header-inner">${brand()}<nav class="rh-nav ${s.menu?'open':''}" aria-label="Ana menü" id="rh-nav"><div class="rh-nav-group"><button type="button" class="rh-nav-button" data-action="tools" aria-expanded="${s.tools}" aria-controls="rh-tool-menu">Ücretsiz araçlar ${icon('chevron')}</button><div class="rh-dropdown" id="rh-tool-menu" ${s.tools?'':'hidden'}>${choices.map(([page,ico,note])=>`<a href="#${page}" data-page="${page}">${icon(ico)}<span>${pageNames[page]}<small>${note}</small></span></a>`).join('')}${navlink('tools', 'Tüm araçları gör →', 'rh-dropdown-all')}</div></div>${navlink('scenes','AI stüdyo')}${navlink('artistic','Sanatsal QR <span class="rh-nav-pro">ÖZEL</span>')}<a href="#examples" data-anchor="examples">Örnekler</a></nav><div class="rh-header-actions"><a href="https://www.renderhane.com/tr/login" target="_blank" rel="noopener noreferrer">Giriş yap</a>${navlink('background',`Ücretsiz başla ${icon('arrow')}`,'rh-btn rh-btn-primary')}<button class="rh-menu-button" data-action="menu" aria-label="Menüyü aç/kapat" aria-expanded="${s.menu}" aria-controls="rh-nav">${icon(s.menu?'close':'menu')}</button></div></div></header>${options.preview===false?'':`<div class="rh-demo-bar"><span class="rh-dot"></span>Arayüz önizlemesi <span class="rh-demo-extra">· Standart QR çalışır · AI ve sipariş servisleri bağlı değil</span><a href="#faq" data-anchor="faq">Kapsamı gör ${icon('arrow')}</a></div>`}`;
  }
  function footer(): string {
    return `<footer class="rh-footer rh-footer-v3"><div class="rh-wrap"><div class="rh-footer-top"><div>${brand()}<p>Fikirden görsele.<br>Görselden yeni olasılıklara.</p></div><div><strong>Ücretsiz araçlar</strong>${navlink('background')}${navlink('qr')}${navlink('nfc')}</div><div><strong>Üretim & tasarım</strong>${navlink('scenes')}${navlink('artistic')}<a href="#examples" data-anchor="examples">Örnek çalışmalar</a></div><div><strong>Renderhane</strong>${navlink('tools','Tüm araçlar')}<a href="#faq" data-anchor="faq">Demo kapsamı</a><a href="https://www.renderhane.com/tr" target="_blank" rel="noopener noreferrer">Mevcut siteyi aç ↗</a></div></div><div class="rh-footer-bottom"><span>Renderhane · Arayüz dönüşümü / V3</span><span>Ücretsiz araçlar ve ücretli özel tasarım ayrı sunulur.</span></div></div></footer>`;
  }
  function toolCard(page: Page, ico: string, note: string, desc: string): string { return `<a href="#${page}" data-page="${page}" class="rh-tool-card"><div class="rh-tool-card-top"><div class="rh-icon-tile">${icon(ico)}</div><span class="rh-pill">${note}</span></div><h3>${pageNames[page]}</h3><p>${desc}</p><div class="rh-tool-card-bottom"><span>Aracı aç</span>${icon('arrow')}</div></a>`; }
  function method(): string { return `<div class="rh-method" id="how"><div><div class="rh-eyebrow">ÜRETİM AKIŞI</div><h2>Fotoğrafla başla.<br>İhtiyacına göre dönüştür.</h2></div>${[['01', 'Fotoğrafını seç', 'Kendi ürününü yükle veya hazır örneği incele.'], ['02', 'Aracını seç', 'Arka planı temizle, sahne ayarlarını belirle.'], ['03', 'Sonucunu kullan', 'Çıktıyı kontrol et ve uygun biçimde indir.']].map(t => `<div class="rh-step"><span>${t[0]}</span><div><strong>${t[1]}</strong><p>${t[2]}</p></div></div>`).join('')}</div>`; }
  function home(): string {
    return `<main id="rh-main" class="rh-page rh-home-v3" tabindex="-1">
      <section class="rh-hero-shell"><div class="rh-wrap rh-hero-v3">
        <div class="rh-hero-copy-v3"><div class="rh-overline"><span class="rh-dot"></span> GÖRSEL ÜRETİMİN YENİ ÇALIŞMA ALANI</div>
          <h1>Bir fotoğraf.<br><span>Birçok olasılık.</span></h1>
          <p>Ürününü öne çıkar. Arka planını temizle, yeni sahneler hazırla. QR ve NFC ile tasarımını dijital dünyaya bağla.</p>
          <div class="rh-hero-actions">${navlink('background', `Ücretsiz başla ${icon('arrow')}`, 'rh-btn rh-btn-primary')}<a class="rh-btn rh-btn-quiet" href="#examples" data-anchor="examples">Örnekleri incele ${icon('image')}</a></div>
          <div class="rh-hero-footnote"><span>${icon('check')}Arka plan: günde 3 ücretsiz</span><span>${icon('check')}Standart QR: sınırsız</span></div>
          <div class="rh-hero-selector"><span>BUGÜN NE ÜRETECEKSİN?</span><div>${navlink('background', `${icon('eraser')}Ürün görseli`)}${navlink('qr', `${icon('qr')}QR kod`)}${navlink('nfc', `${icon('nfc')}NFC etiketi`)}</div></div>
        </div>
        <div class="rh-hero-visual-v3">
          <div class="rh-hero-photo-v3"><img src="${asset('photo.jpg')}" alt="Onaylanan tasarımdaki amber serum şişesi; temsili görsel" width="896" height="894" fetchpriority="high"/><span class="rh-editor-chip">${icon('image')}ÜRÜN STÜDYOSU</span><div class="rh-photo-caption"><span>AURELIA / SERUM</span><small>Onaylı şişe örneği · temsili</small></div></div>
          <div class="rh-hero-cutout-card"><div><span class="rh-tiny-icon">${icon('eraser')}</span><strong>Arka plan? Kaldır.</strong></div><div class="rh-checker"><img src="${asset('cutout.png')}" alt="Aynı şişe piksellerinden hazırlanmış saydam dekupe" width="896" height="894"/></div><p>${icon('check')}Hazır dekupe örneği</p></div>
          <div class="rh-hero-scene-strip"><span>${icon('layers')}Tek ürün, farklı dünyalar</span><div>${[0,1,2].map(i=>`<a href="#scenes" data-page="scenes" aria-label="${sceneNames[i]} sahnesini incele"><img src="${asset(`scene-${i}.jpg`)}" alt="${sceneNames[i]} hazır sahne örneği"/></a>`).join('')}</div></div>
        </div>
      </div></section>
      <div class="rh-wrap"><div class="rh-use-strip"><span>FİKİRDEN YAYINA</span><strong>${icon('box')}E-ticaret</strong><strong>${icon('image')}İçerik üretimi</strong><strong>${icon('layers')}Tasarım</strong><strong>${icon('qr')}Fiziksel + dijital</strong></div>
      <section class="rh-section" id="tools"><div class="rh-section-heading"><div><div class="rh-eyebrow">TEK ÇATI, NET ARAÇLAR</div><h2>İhtiyacın kadar araç.<br>Gerektiği kadar kolay.</h2></div>${navlink('tools', `Tüm araçlar ${icon('arrow')}`, 'rh-text-link')}</div>
        <div class="rh-tools-grid">${toolCard('background','eraser','3 / gün ücretsiz','Arka planı temizle. Ürününü şeffaf PNG ile tasarıma hazırla.')}${toolCard('scenes','image','AI stüdyo','Ürününü farklı sahnelerde sun. Kompozisyonunu tek yerden yönet.')}${toolCard('qr','qr','Sınırsız ücretsiz','Web, WiFi ve kişi bilgilerini paylaş. PNG ya da SVG indir.')}${toolCard('nfc','nfc','Ücretsiz araç','Uyumlu telefonla etikete bağlantı veya iletişim bilgisi yaz.')}</div>
      </section>
      <section class="rh-feature-split"><div class="rh-feature-demo"><div class="rh-surface-head"><span>${icon('eraser')}ARKA PLAN STÜDYOSU</span><span class="rh-pill">Önce / sonra</span></div><div class="rh-compare rh-checker" style="--split:48%"><img src="${asset('cutout.png')}" alt="Örnek dekupe"/><div class="rh-compare-front"><img src="${asset('photo.jpg')}" alt="Arka planlı şişe örneği"/></div><div class="rh-compare-line"><span class="rh-compare-handle">↔</span></div><input class="rh-compare-input" type="range" min="0" max="100" value="48" aria-label="Ana sayfa önce ve sonra karşılaştırması" data-compare="true"/><span class="rh-compare-label left">Önce</span><span class="rh-compare-label right">Hazır dekupe</span></div></div>
        <div class="rh-feature-copy"><div class="rh-eyebrow">ÜRÜNÜN ODAKTA KALSIN</div><h2>Arka planı değil,<br>ürününü göster.</h2><p>Görselini yükle, sonucu karşılaştır ve ihtiyacına uygun zeminle indir. Daha temiz bir vitrin için sade bir başlangıç.</p><div class="rh-feature-points"><div>${icon('layers')}Kaydırarak karşılaştır</div><div>${icon('download')}Şeffaf veya düz zeminle PNG indir</div><div>${icon('image')}Kendi fotoğrafını önizle</div></div>${navlink('background', `Arka plan aracını aç ${icon('arrow')}`, 'rh-btn rh-btn-primary')}<small>Buradaki karşılaştırma hazır örnektir; canlı AI çıktısı değildir.</small></div></section>
      ${premiumBlock()}
      <section class="rh-section" id="examples"><div class="rh-section-heading"><div><div class="rh-eyebrow">SAHNE DEĞİŞİR. ODAK DEĞİŞMEZ.</div><h2>Ürününe bir dünya kur.</h2></div><div><p>Onayladığımız şişe tasarımından hazır örnekler. Canlı üretim değil, görsel yön önerileridir.</p>${navlink('scenes', `Sahne stüdyosuna git ${icon('arrow')}`, 'rh-text-link')}</div></div><div class="rh-gallery">${[0,1,2].map(i=>`<a href="#scenes" data-page="scenes" class="rh-editorial-card"><figure><img src="${asset(`scene-${i}.jpg`)}" alt="${sceneNames[i]} temsili kompozisyonu" loading="lazy" width="984" height="594"/><figcaption><strong>${sceneNames[i]}</strong><span>Hazır sahne ${icon('arrow')}</span></figcaption></figure></a>`).join('')}</div></section>
      ${method()}
      <section class="rh-section rh-faq-v3" id="faq"><div><div class="rh-eyebrow">AKLINDA SORU KALMASIN</div><h2>Ne ücretsiz?<br>Ne özel tasarım?</h2><p>Aracın sınırları ve üretim koşulları, işlem başlamadan önce görünür.</p></div><div>${faqItems()}</div></section>
      <section class="rh-final-cta"><div><span class="rh-eyebrow">SIRADAKİ GÖRSELİN BURADA BAŞLASIN</span><h2>Hazırsan, üretime geçelim.</h2></div>${navlink('tools', `Araçları keşfet ${icon('arrow')}`, 'rh-btn rh-btn-primary')}</section></div>
    </main>`;
  }
  function faqItems(): string {
    return `<details><summary>Ücretsiz araçlar hangileri?</summary><p>Standart QR oluşturma sınırsızdır. Arka plan kaldırma için kayıt olmadan günde 3 ücretsiz hak mesajı korunur. NFC yazma aracı için uyumlu cihaz ve ayrıca fiziksel etiket gerekir. Bu demo arka plan kullanım hakkını tüketmez.</p></details><details><summary>Sanatsal QR ile ücretsiz QR arasındaki fark nedir?</summary><p>Ücretsiz araç, doğrudan kullanılabilen standart statik QR üretir. Sanatsal QR ayrı bir ücretli özel tasarım teklifidir. Paylaşılan süslemeli görsel bir vitrin örneğidir; tarama başarısı ve hedef bağlantısı bu demoda doğrulanmamıştır.</p></details><details><summary>Şişe görselleri gerçek üretim sonucu mu?</summary><p>Hayır. Şişe ve sahneler daha önce onaylanan yapay zekâ görsellerinden alınmıştır. Fincan kaldırılmıştır. Arka plan karşılaştırmasında aynı şişe görselinin pikselleri ve hazırlanmış dekupe kullanılır; bunlar kamera fotoğrafı veya Renderhane API performans ölçümü değildir.</p></details><details><summary>Bu demoda neler çalışıyor?</summary><p>Sayfa geçişleri, yerel görsel yükleme, karşılaştırma, örnek indirme ve gerçek standart QR üretimi çalışır. Sanatsal QR formu indirilebilir talep taslağı hazırlar; ücret almaz veya başvuru göndermez. Canlı AI, hesap ve ödeme akışları ayrıca bağlanmalıdır.</p></details>`;
  }
  function premiumBlock(compact = false): string {
    return `<section class="rh-premium-block ${compact ? 'rh-premium-compact' : ''}" aria-labelledby="rh-premium-title"><div class="rh-premium-copy"><div class="rh-premium-label">${icon('spark')}SANATSAL QR <span>ÜCRETLİ ÖZEL TASARIM</span></div><h2 id="rh-premium-title">Sadece bir kod değil.<br><em>Markanın bir parçası.</em></h2><p>Ambalajında, kartvizitinde ya da vitrinde. Bağlantını, markanın görsel dünyasıyla buluşturan bir tasarım yaklaşımı.</p><div class="rh-premium-actions">${navlink('artistic', `Sanatsal QR’ı keşfet ${icon('arrow')}`, 'rh-btn rh-btn-light')}${navlink('qr', 'Standart QR ücretsiz', 'rh-premium-secondary')}</div><small>Ücretsiz QR aracından ayrı sunulur. Görselin taranabilirliği doğrulanmadı.</small></div><a href="#artistic" data-page="artistic" class="rh-premium-art" aria-label="Sanatsal QR özel tasarım örneğini incele"><img src="${asset('artistic-qr.png')}" alt="Paylaştığınız altın, mor ve turkuaz çiçek desenli sanatsal QR örneği" loading="lazy" width="764" height="765"/><span>ÇİÇEK & ORNAMENT <span>Özel tasarım örneği ${icon('arrow')}</span></span></a></section>`;
  }
  function toolsView(): string {
    return `<main id="rh-main" class="rh-page rh-wrap" tabindex="-1">${heading('İşine yarayan <span class="rh-highlight">aracı seç.</span>','Ücretsiz yardımcı araçlar, AI çalışma alanı ve özel tasarım hizmeti. Her biri kendi kullanım koşuluyla.',['Ortak çalışma alanı','Türkçe arayüz','Açık kullanım koşulları'])}<div class="rh-catalog-title"><h2>Ücretsiz araçlar</h2><span>Gündelik işleri kolaylaştır</span></div><div class="rh-tools-grid rh-tools-three">${toolCard('background','eraser','3 / gün ücretsiz','Ürün görselini temizle; sonucu karşılaştırıp PNG olarak indir.')}${toolCard('qr','qr','Sınırsız ücretsiz','8 içerik türünde çalışan standart QR üret.')}${toolCard('nfc','nfc','Ücretsiz araç','İçeriği hazırla, uyumlu telefonda NFC etiketine aktar.')}</div><div class="rh-catalog-title"><h2>AI stüdyo</h2><span>Görsel üretim çalışma alanı</span></div><div class="rh-studio-entry"><img src="${asset('scene-1.jpg')}" alt="Minimal şişe sahnesi"/><div><span class="rh-eyebrow">SAHNE OLUŞTURMA</span><h2>Ürününe yeni bir ortam.</h2><p>Kompozisyonu tarif et, sahne yönünü seç. Bu önizlemede hazır örnekler bulunur; canlı üretim mevcut AI akışına bağlanır.</p>${navlink('scenes', `Stüdyoyu aç ${icon('arrow')}`, 'rh-btn rh-btn-primary')}</div></div>${premiumBlock(true)}<div class="rh-notice rh-catalog-note">Bu dönüşüm, ana sayfa ve burada listelenen ekranları kapsar. Mevcut 3D, video, hesap, ödeme ve diğer üretim modülleri kaldırılmaz; canlı projeye aktarılırken mevcut yolları korunmalıdır.</div></main>`;
  }
  function artisticView(): string {
    const f=s.brief;
    return `<main id="rh-main" class="rh-page rh-wrap" tabindex="-1"><div class="rh-breadcrumb">${navlink('home','ANA SAYFA')}${icon('arrow')}<span>SANATSAL QR</span></div><section class="rh-art-hero"><div class="rh-art-intro"><span class="rh-pill rh-paid">${icon('spark')}Ücretli özel tasarım</span><h1>Bağlantın,<br><span>sanata dönüşsün.</span></h1><p>Standart karelerin ötesinde, markana ait bir görsel dil. Kullanım alanını ve tasarım fikrini tanımlayarak başla.</p><div class="rh-art-usecases"><span>Ambalaj</span><span>Kartvizit</span><span>Vitrin</span><span>Etkinlik</span></div><div class="rh-art-plain-note">${icon('qr')}<div><strong>Sadece bir bağlantı paylaşacaksan</strong><p>Ücretsiz standart QR aracı bunun için hazır.</p>${navlink('qr', `Ücretsiz QR oluştur ${icon('arrow')}`, 'rh-text-link')}</div></div></div><figure class="rh-art-hero-image"><img src="${asset('artistic-qr.png')}" alt="Paylaştığınız sanatsal QR tasarımı, değiştirilmeden kullanılmıştır" width="764" height="765"/><figcaption><strong>Çiçek & Ornament</strong><span>Paylaşılan tasarım örneği</span></figcaption></figure></section>
      <div class="rh-art-warning">${icon('scan')}<div><strong>Estetik kadar okunabilirlik de önemli.</strong><p>Bu örneğin hedef bağlantısı ve taranabilirliği doğrulanmadı. Son tasarım; farklı telefonlar, baskı boyutu, ışık ve kullanım mesafesinde test edilmeden yayına alınmamalı.</p></div></div>
      <section class="rh-brief-section"><div class="rh-brief-aside"><span class="rh-eyebrow">ÖNCE İHTİYACINI NETLEŞTİR</span><h2>Tasarım talebini<br>birlikte şekillendirelim.</h2><p>Bağlantını, kullanım yerini ve istediğin görsel yönü tek bir taslakta topla.</p><ol><li><span>01</span><div><strong>İçerik ve kullanım</strong><p>QR nereye yönlenecek, nerede görünecek?</p></div></li><li><span>02</span><div><strong>Görsel yön</strong><p>Marka renkleri, stil ve referanslar.</p></div></li><li><span>03</span><div><strong>Teklif ve doğrulama</strong><p>Üretim, fiyat ve test koşulları ayrıca netleştirilir.</p></div></li></ol><p class="rh-brief-disclaimer">Demo formu başvuru göndermez. Talebini dosya olarak indirirsin; ödeme alınmaz.</p></div>
      <form class="rh-panel rh-brief-form" id="rh-brief-form"><div class="rh-panel-top"><h2 class="rh-panel-title">${icon('text')}Tasarım talebi</h2><span class="rh-pill">Yerel taslak</span></div><div class="rh-panel-body"><div class="rh-field"><label for="rh-brief-brand">Marka / proje adı *</label><input class="rh-input" id="rh-brief-brand" data-brief="brand" value="${esc(f.brand)}" maxlength="100" required placeholder="Markanızın adı"/></div><div class="rh-field"><label for="rh-brief-url">Hedef bağlantı *</label><input class="rh-input" id="rh-brief-url" data-brief="url" type="url" value="${esc(f.url)}" maxlength="1000" required placeholder="https://…"/></div><div class="rh-two-fields"><div class="rh-field"><label for="rh-brief-use">Kullanım alanı</label><select class="rh-select" id="rh-brief-use" data-brief="usage">${['Ürün ambalajı','Kartvizit','Mağaza / vitrin','Etkinlik / afiş','Dijital paylaşım'].map(v=>`<option ${f.usage===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="rh-field"><label for="rh-brief-size">Planlanan baskı boyutu</label><input class="rh-input" id="rh-brief-size" data-brief="size" value="${esc(f.size)}" maxlength="100" placeholder="Örn. 8 × 8 cm"/></div></div><div class="rh-field"><label for="rh-brief-style">Tasarım yönü</label><select class="rh-select" id="rh-brief-style" data-brief="style">${['Çiçek & Ornament','Markama özel farklı bir yön'].map(v=>`<option ${f.style===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="rh-field"><label for="rh-brief-notes">Renkler, beklentiler ve notlar</label><textarea class="rh-textarea" id="rh-brief-notes" data-brief="notes" maxlength="1500" placeholder="Marka renkleri, kullanım mesafesi, tasarım referansı…">${esc(f.notes)}</textarea></div><button class="rh-btn rh-btn-primary rh-block-btn" type="submit">${icon('download')}Tasarım talebini indir</button><div class="rh-notice" id="rh-brief-status" role="status">Bu form yalnızca metin dosyası hazırlar; tasarım üretimi veya sipariş başlatmaz.</div></div></form></section>
      <section class="rh-art-comparison"><div><span class="rh-pill green">Ücretsiz araç</span><h3>Standart QR</h3><p>Bağlantı ve bilgilerini hızlıca paylaş. Çalışan statik QR kodunu hemen indir.</p>${navlink('qr',`QR oluştur ${icon('arrow')}`,'rh-text-link')}</div><div><span class="rh-pill rh-paid">Ücretli özel tasarım</span><h3>Sanatsal QR</h3><p>Görsel kimliğe uygun tasarım yönü. Üretim ve okunabilirlik testi ayrı süreçtir.</p><a href="#rh-brief-form" class="rh-text-link" data-action="brief-focus">Talep taslağını hazırla ${icon('arrow')}</a></div></section></main>`;
  }
  function heading(title: string, description: string, badges: string[]): string { return `<div class="rh-breadcrumb">${navlink('home', 'ANA SAYFA')}${icon('arrow')}<span>ARAÇLAR</span>${icon('arrow')}<span>${pageNames[s.page]}</span></div><div class="rh-page-heading"><div><h1>${title}</h1><p>${description}</p><div class="rh-badges">${badges.map(t => `<span class="rh-pill">${icon('check')}${t}</span>`).join('')}</div></div><div class="rh-heading-note">${icon('info')} Üretim alanı sade.<br>Dosyanız, ayarlarınız ve sonuç aynı yerde.</div></div>`; }
  function benefits(items: string[][]): string { return `<div class="rh-benefits">${items.map(([i, title, text]) => `<div class="rh-benefit"><div class="rh-icon-tile">${icon(i)}</div><h3>${title}</h3><p>${text}</p></div>`).join('')}</div>`; }
  function uploadBox(compact = false): string { return `<label class="rh-upload" tabindex="0" data-upload-zone="true">${compact ? icon('upload') : `<div class="rh-icon-tile">${icon('upload')}</div>`}<strong>${s.file ? 'Fotoğrafı değiştir' : 'Fotoğrafını buraya bırak'}</strong><p>veya dosya seç</p><small>JPG, PNG, WebP · en fazla 5 MB</small><input class="rh-sr" type="file" accept="image/jpeg,image/png,image/webp" data-file="true" aria-label="Ürün fotoğrafı seç"/></label>`; }
  function compareCanvas(): string {
    if (s.fileUrl && !s.result) return `<div class="rh-panel-top"><span class="rh-panel-title">Yüklenen fotoğraf</span><span class="rh-pill">Yerel önizleme</span></div><div class="rh-empty"><img class="rh-custom-preview" src="${s.fileUrl}" alt="Yüklediğiniz fotoğraf"/></div><div class="rh-canvas-footer"><span>${icon('info')}Henüz AI işlemi uygulanmadı.</span><button class="rh-link-button" data-action="sample">Hazır örneğe dön</button></div>`;
    const before = s.fileUrl || asset('photo.jpg'); const after = s.result || asset('cutout.png');
    return `<div class="rh-panel-top"><span class="rh-panel-title">${icon('image')}${s.file ? esc(s.file.name) : 'Onaylı şişe örneği'}</span><div class="rh-segmented" aria-label="Görünüm">${[['compare', 'Karşılaştır'], ['original', 'Orijinal'], ['result', 'Sonuç']].map(([key, label]) => `<button data-view="${key}" aria-pressed="${s.tab === key}">${label}</button>`).join('')}</div></div><div class="rh-compare ${s.bgColor === 'transparent' ? 'rh-checker' : ''}" style="${s.bgColor !== 'transparent' ? `background:${esc(s.bgColor)};` : ''}--split:${s.tab === 'original' ? '100' : s.tab === 'result' ? '0' : '50'}%"><img src="${esc(after)}" alt="${s.result ? 'Arka plan kaldırılmış sonuç' : 'Önceden hazırlanmış örnek dekupe'}"/><div class="rh-compare-front"><img src="${esc(before)}" alt="Orijinal ürün fotoğrafı"/></div><span class="rh-compare-label left" ${s.tab === 'result' ? 'hidden' : ''}>Orijinal</span><span class="rh-compare-label right" ${s.tab === 'original' ? 'hidden' : ''}>${s.result ? 'Sonuç' : 'Hazır örnek çıktı'}</span>${s.tab === 'compare' ? `<div class="rh-compare-line"><span class="rh-compare-handle">↔</span></div><input class="rh-compare-input" type="range" min="0" max="100" value="50" aria-label="Önce ve sonra karşılaştırması" data-compare="true"/>` : ''}</div><div class="rh-canvas-footer"><span>${icon('scan')}Ayrıntıları karşılaştır</span><span>${s.result ? 'API tarafından döndürülen çıktı' : 'Temsili şişe görseli · Hazır dekupe'}</span></div>`;
  }
  function background(): string {
    const hasAdapter = !!options.adapters?.removeBackground;
    return `<main id="rh-main" class="rh-page rh-wrap" tabindex="-1">${heading('Arka planı <span class="rh-highlight">geride bırak.</span>', 'Ürün fotoğrafını yükle. Sade bir çalışma alanında incele, arka planını düzenle ve çıktını indir.', ['Kayıt olmadan', 'Günde 3 ücretsiz kullanım', 'Şeffaf PNG'])}<div class="rh-mobile-upload"><span>Kendi fotoğrafınla başla</span>${btn("Fotoğraf seç","upload-open",true,"upload")}</div><div class="rh-workspace"><section class="rh-panel" id="rh-canvas">${compareCanvas()}</section><aside class="rh-panel rh-tool-controls"><div class="rh-panel-top"><span class="rh-panel-title">${icon('upload')}Fotoğraf ve çıktı</span><span class="rh-pill purple">${hasAdapter ? 'API bağlı' : 'Demo'}</span></div><div class="rh-panel-body">${uploadBox()}<div class="rh-control-settings"><div class="rh-field"><label for="rh-format">Çıktı biçimi</label><select class="rh-select" id="rh-format"><option>PNG</option></select></div><div class="rh-field"><label for="rh-size-info">Boyut</label><input class="rh-input" id="rh-size-info" value="Kaynak boyutu" readonly/></div><div class="rh-label-row"><span>Arka plan</span><span class="rh-helper">PNG önizlemesi</span></div><div class="rh-color-row">${['transparent', '#ffffff', '#eee9e2', '#e9e4f6', '#dce8df', '#202832'].map(c => `<button data-bg="${c}" class="rh-color-button ${c === 'transparent' ? 'rh-checker' : ''}" style="--swatch:${c}" aria-label="${c === 'transparent' ? 'Şeffaf' : c} arka plan" aria-pressed="${s.bgColor === c}"></button>`).join('')}</div><button class="rh-btn rh-btn-primary rh-block-btn" data-action="remove" ${s.busy ? 'disabled' : ''}>${icon(s.busy ? 'spinner' : 'eraser', s.busy ? 'rh-spin' : '')}${s.busy ? 'İşleniyor…' : hasAdapter && s.file ? 'Arka planı kaldır' : s.file ? 'AI bağlantısını kontrol et' : 'Örnek sonucu göster'}</button><button class="rh-btn rh-block-btn" data-action="download-bg" ${s.file && !s.result ? 'disabled' : ''}>${icon('download')}${s.result ? 'PNG indir' : 'Örnek PNG indir'}</button><div class="rh-file-card"><img src="${s.fileUrl || asset('photo.jpg')}" alt=""/><div><strong>${s.file ? esc(s.file.name) : 'aurelia-sise-ornek.jpg'}</strong><small>${s.file ? (s.file.size / 1024).toFixed(0) + ' KB · yerel dosya' : '896 × 894 · temsili şişe örneği'}</small></div></div></div><div class="rh-control-note"><div class="rh-status" id="rh-bg-status" role="status">${s.bgMessage ? esc(s.bgMessage) : 'Fotoğraf yüklemek üretim işlemi başlatmaz.'}</div>${hasAdapter ? `<p class="rh-helper">İşlem düğmesine basıldığında fotoğraf mevcut API’ye gönderilir. ${s.remaining !== null ? `Kalan hak: ${s.remaining}` : ''}</p>` : `<div class="rh-notice">Demo, yalnızca hazır örneğin dekupe sonucunu içerir. Kendi fotoğrafın için mevcut AI API’sini bağlamak gerekir.</div>`}</div></div></aside></div>${composerEntry()}${benefits([['image', 'Gerçek fotoğrafla başla', 'Örnek yerine kendi ürün fotoğrafını da yükleyebilirsin.'], ['layers', 'Sonucu karşılaştır', 'Kaydırıcıyla kenarları ve detayları incele.'], ['download', 'PNG olarak indir', 'Saydam veya seçtiğin düz zeminle dışa aktar.'], ['shield', 'İşlemler görünür', 'Demo çıktısı ve gerçek API çıktısı ayrı etiketlenir.']])}</main>`;
  }
  function composerEntry(): string {
    return `<section class="mc-entry"><div><span class="mc-kicker">SONRAKİ ADIM · ÜCRETSİZ + ÜYELİKLİ</span><h2>Kendi sahneni kur.</h2><p>Kendi arka planını yükle; ürününü sürükle, boyutlandır ve döndür. Manuel yerleştirme ücretsizdir; indirmek için üyelik gerekir. AI ile sahne üretimi ayrı ve kredilidir.</p></div><button type="button" class="rh-btn rh-btn-primary" data-action="open-composer">${icon('layers')}Sahneye yerleştir</button></section>`;
  }
  function scenesView(): string {
    const activeScenes = s.scenes || sceneNames.map((label, i) => ({ url: asset(`scene-${i}.jpg`), label }));
    return `<main id="rh-main" class="rh-page rh-wrap" tabindex="-1">${heading('Ürününe <span class="rh-highlight">yeni bir sahne.</span>', 'Fotoğrafını seç, kompozisyonu tarif et. Sonuçlarını tek bir çalışma alanında karşılaştır.', ['Ürün odaklı kompozisyon', 'Hazır sahne yönleri', 'Düzenli çıktı alanı'])}<div class="rh-workspace rh-scene-workspace"><section class="rh-panel rh-scene-form"><div class="rh-panel-body"><div><div class="rh-number-title"><span>1</span>Ürün fotoğrafı</div><div class="rh-product-input"><div class="rh-checker"><img src="${s.fileUrl || asset('cutout.png')}" alt="Ürün fotoğrafı girdisi"/></div>${uploadBox(true)}</div>${s.file ? `<button class="rh-link-button" data-action="sample">Hazır örneğe dön</button>` : ''}</div><div><div class="rh-number-title"><span>2</span>Sahneni tarif et</div><label class="rh-sr" for="rh-prompt">Sahne açıklaması</label><textarea class="rh-textarea" id="rh-prompt" maxlength="1500" data-prompt="true">${esc(s.prompt)}</textarea><div class="rh-label-row"><span>Bir yön seç</span><span class="rh-helper">4 hazır örnek</span></div><div class="rh-tags">${sceneNames.map((name, i) => `<button class="rh-tag" data-preset="${i}" aria-pressed="${s.scenePreset === i}">${name}</button>`).join('')}</div><button class="rh-btn rh-btn-primary rh-block-btn" data-action="generate-scenes" ${s.busy ? 'disabled' : ''}>${icon(s.busy ? 'spinner' : 'spark', s.busy ? 'rh-spin' : '')}${options.adapters?.generateScenes && s.file ? 'Sahneleri oluştur' : 'Örnek sahneleri göster'}</button><div class="rh-notice" id="rh-scene-status" role="status">${s.bgMessage ? esc(s.bgMessage) : 'Buradaki sahneler önceden hazırlanmış kompozisyonlardır. Canlı AI üretimi için API adaptörünü bağla.'}</div></div></div></section><section class="rh-panel"><div class="rh-scene-result-header"><div><h2>${s.scenes ? 'Üretilen sahneler' : 'Örnek kompozisyonlar'}</h2><p>${s.scenes ? 'API’den dönen sonuçlar.' : 'Onaylı şişe tasarımından dört hazır sahne.'}</p></div><span class="rh-pill">${activeScenes.length} ${s.scenes ? 'sonuç' : 'hazır örnek'}</span></div><div class="rh-scenes">${activeScenes.map((scene, i) => `<article class="rh-scene" data-active="${s.scenePreset === i}"><img src="${esc(scene.url)}" alt="${esc(scene.label)} kompozisyonu" width="1200" height="800"/><span class="rh-scene-label">${esc(scene.label)}</span><button class="rh-scene-download" data-download-scene="${i}" aria-label="${esc(scene.label)} indir">${icon('download')}İndir</button></article>`).join('')}</div><div class="rh-canvas-footer"><span>${icon('info')}${s.scenes ? 'Sonuçları kullanmadan önce detayları kontrol et.' : 'Hazır kompozisyonlar, bu arayüzün otomatik AI performansını göstermez.'}</span></div></section></div><section class="rh-section">${method()}</section></main>`;
  }
  function typeTabs(kind: 'qr' | 'nfc'): string { const all = Object.keys(contentLabels) as ContentType[]; const allowed = kind === 'qr' ? all.filter(t => t !== 'app') : all;
    return `<div class="rh-content-types" role="group" aria-label="${kind === 'qr' ? 'QR' : 'NFC'} içerik türü">${allowed.map(type => `<button class="rh-type-btn" type="button" data-${kind}-type="${type}" aria-pressed="${s[`${kind}Type`] === type}">${icon(contentIcons[type])}<span>${contentLabels[type]}</span></button>`).join('')}</div>`;
  }
  function fields(kind: 'qr' | 'nfc'): string {
    const type = s[`${kind}Type`]; const f = s[kind];
    const input = (key: string, label: string, placeholder: string, inputType = 'text'): string => `<div class="rh-field"><label for="rh-${kind}-${key}">${label}</label><input class="rh-input" id="rh-${kind}-${key}" data-field="${key}" data-kind="${kind}" type="${inputType}" value="${esc(f[key])}" placeholder="${esc(placeholder)}" maxlength="${key === 'url' || key === 'website' ? 1000 : 200}" autocomplete="off"/></div>`;
    const area = (key: string, label: string): string => `<div class="rh-field"><label for="rh-${kind}-${key}">${label}</label><textarea class="rh-textarea" id="rh-${kind}-${key}" data-field="${key}" data-kind="${kind}" maxlength="1200">${esc(f[key])}</textarea></div>`;
    switch (type) {
      case 'url': return input('url', 'Web adresi', 'https://renderhane.com', 'url') + `<p class="rh-helper">https:// ile başlayan bağlantını gir.</p>`;
      case 'vcard': return input('name', 'Ad soyad *', 'Adınız Soyadınız') + `<div class="rh-two-fields">${input('phone', 'Telefon', '+90…', 'tel')}${input('email', 'E-posta', 'ad@firma.com', 'email')}</div>` + input('org', 'Kurum / marka', 'Marka adı') + input('website', 'Web sitesi', 'https://…', 'url');
      case 'wifi': return input('ssid', 'Ağ adı (SSID) *', 'Misafir ağı') + input('password', 'Ağ şifresi', 'Paylaşılacak WiFi şifresi', 'password') + `<div class="rh-field"><label for="rh-${kind}-encryption">Şifreleme</label><select class="rh-select" data-field="encryption" data-kind="${kind}" id="rh-${kind}-encryption">${['WPA', 'WEP', 'nopass'].map(e => `<option value="${e}" ${(f.encryption || 'WPA') === e ? 'selected' : ''}>${e === 'nopass' ? 'Şifresiz ağ' : e}</option>`).join('')}</select></div><p class="rh-helper">${kind === 'qr' ? 'QR, ağ şifresini içerir. Yalnızca paylaşmak istediğin bir misafir ağını kullan.' : 'WiFi için özel WSC/NDEF kodlaması gerekir. Bu bağımsız sürümde WiFi yazımı kapalıdır; QR aracını kullanabilirsin.'}</p>`;
      case 'phone': return input('phone', 'Telefon numarası *', '+905551234567', 'tel');
      case 'email': return input('email', 'E-posta adresi *', 'ad@firma.com', 'email') + input('subject', 'Konu', 'Merhaba') + area('body', 'Mesaj');
      case 'sms': return input('phone', 'Telefon numarası *', '+905551234567', 'tel') + area('body', 'Mesaj');
      case 'location': return `<div class="rh-two-fields">${input('lat', 'Enlem *', '41.0082', 'text')}${input('lon', 'Boylam *', '28.9784', 'text')}</div><p class="rh-helper">Ondalık ayırıcı olarak nokta kullan.</p>`;
      case 'text': return area('text', 'Metin *');
      case 'app': return input('package', 'Android paket adı *', 'com.firma.uygulama') + `<p class="rh-helper">Google Play bağlantısı ve Android uygulama kaydı yazılır.</p>`;
    }
  }
  function qrView(): string { return `<main id="rh-main" class="rh-page rh-wrap rh-qr-styled" tabindex="-1">${heading('Senin stilin.<br><span class="rh-highlight">Önce okunabilirlik.</span>', 'İçeriğini gir, hazır şeklini seç. QR yapısı korunur; her değişiklikte dijital veri kontrolü yeniden çalışır.', ['Ücretsiz · Kayıt yok', 'Hazır vektörel şekiller', 'Kontrollü PNG + SVG'])}<div class="rh-workspace rh-qr-workspace"><section class="rh-panel rh-qr-content"><div class="rh-number-title"><span>1</span>İçeriğini seç</div>${typeTabs('qr')}<div id="rh-qr-fields">${fields('qr')}</div><div class="rh-number-title rh-qr-step"><span>2</span>Hazır şeklini seç</div><div class="rh-qr-presets" role="group" aria-label="QR modül şekli">${QR_PRESETS.map(pr => `<button type="button" class="rh-qr-preset" data-qr-style="${pr.id}" aria-pressed="${s.qrStyle === pr.id}"><span class="rh-qr-preset-icon">${presetIcon(pr.id)}</span><strong>${pr.label}</strong><small>${pr.hint}</small></button>`).join('')}</div><p class="rh-helper rh-qr-shape-note">Şekil yalnız veri alanına uygulanır. İşaret köşe, hizalama, zamanlama ve bilgi alanları kare olarak korunur.</p><div class="rh-number-title rh-qr-step"><span>3</span>Renk ve çıktı boyutu</div><div class="rh-two-fields"><div class="rh-field"><label for="rh-qr-color">Koyu QR rengi</label><div class="rh-color-input"><input type="color" id="rh-qr-color" value="${esc(s.qrColor)}"/><span class="rh-helper" id="rh-qr-hex">${esc(s.qrColor)}</span></div></div><div class="rh-field"><label for="rh-qr-size">Çıktı boyutu</label><select class="rh-select" id="rh-qr-size">${[512, 1024, 2048].map(v => `<option value="${v}" ${s.qrSize === v ? 'selected' : ''}>${v} × ${v} px</option>`).join('')}</select></div></div><div class="rh-qr-lock-note">${icon('shield')}<span><strong>Yapısal alanlar kilitli.</strong> Beyaz zemin, dört modüllük boş kenar ve H hata düzeltmesi korunur. Logo örtüşmesi, şeffaf zemin ve serbest çizim bu sürümde yok.</span></div><div class="rh-notice error" id="rh-qr-error" role="alert" hidden></div></section><section class="rh-panel rh-qr-preview-panel"><div class="rh-panel-top"><h2 class="rh-panel-title">${icon('qr')}QR önizlemesi</h2><span class="rh-pill" id="rh-qr-style-label">${(QR_PRESETS.find(pr => pr.id === s.qrStyle) ?? QR_PRESETS[0]).label}</span></div><div class="rh-qr-result" id="rh-qr-stage" data-invalid="true"><div class="rh-qr-paper" id="rh-qr-svg"></div></div><div class="rh-qr-meta" id="rh-qr-meta">Çıktı hazırlanıyor.</div><div class="rh-qr-check" id="rh-qr-check" role="status" aria-live="polite" data-state="pending"><span class="rh-qr-check-icon">${icon('shield')}</span><div><strong id="rh-qr-check-title">Kontrol bekleniyor</strong><p id="rh-qr-check-detail">Geçerli içerik ve okunabilir bir çıktı hazırlanmalı.</p></div></div><div class="rh-qr-result-footer"><div class="rh-toolbar">${btn('PNG indir', 'qr-png', true, 'download', 'disabled')}${btn('SVG indir', 'qr-svg', false, 'download', 'disabled')}</div><p>Test geçmeden indirme açılmaz. Baskıdan önce son boyutta telefonla tara.</p></div><details class="rh-qr-check-scope"><summary>Dijital kontrol neyi doğruluyor?</summary><p>SVG görüntüsünün ve indirilecek PNG&apos;nin bilinen ızgarasından veri okunur; biçim, yönlendirme alanları, hata kontrolü ve içerik eşleşmesi sınanır. Nihai boyut, 6 piksel/modül ve hafif bulanıklıkta toplam 9 kontrol yapılır.</p><p>Bu işlem, kamerayla QR bulma testi veya her telefonda okuma garantisi değildir. Hazır stil örnekleri geliştirme testlerinde OpenCV ve ZBar ile ayrıca okunur. Üretim baskısını gerçek cihazda kontrol et.</p></details><div class="rh-payload" id="rh-qr-payload" aria-label="QR içeriği"></div></section></div>${benefits([['shield', 'Okunabilirlik önce gelir', 'Yapısal alanlar değişmez; hatalı sonuç indirmeye açılmaz.'], ['download', 'Gerçek vektörel çıktı', 'Şekiller SVG yollarıdır; PNG aynı görüntüden üretilir.'], ['infinity', 'AI kredisi harcamaz', 'Hazır şekiller ve kontroller tarayıcıda çalışır.'], ['scan', 'Son baskıyı test et', 'Malzeme, boyut ve telefon sonucu etkileyebilir.']])}${premiumBlock(true)}${ideaSection('qr')}</main>`; }
  function supportedNfc(): boolean { return !!win.NDEFReader && win.isSecureContext; }
  function nfcView(): string { const ready = supportedNfc(); return `<main id="rh-main" class="rh-page rh-wrap" tabindex="-1">${heading('Bir dokunuşla <span class="rh-highlight">bağlantı kur.</span>', 'NFC etiketine web adresi veya iletişim bilgisi yaz. Önce içeriği hazırla, sonra uyumlu telefonla etikete aktar.', ['Uygulama kurmadan', 'Uyumlu Android + Chrome', 'Fiziksel etiket gerekir'])}<div class="rh-workspace rh-nfc-workspace"><section class="rh-panel rh-qr-content"><div class="rh-number-title"><span>1</span>İçerik türünü seç</div>${typeTabs('nfc')}<div class="rh-section-label">2. İçeriğini hazırla</div><div id="rh-nfc-fields">${fields('nfc')}</div><label class="rh-toggle"><input type="checkbox" id="rh-nfc-overwrite" ${s.nfcOverwrite ? 'checked' : ''}/>Etiketteki mevcut içeriğin üzerine yazılmasına izin ver.</label><div class="rh-toolbar" style="margin-top:22px"><button class="rh-btn rh-btn-primary" data-action="nfc-write" ${!ready || s.nfcBusy || s.nfcType === 'wifi' ? 'disabled' : ''}>${icon('nfc')}Etikete yaz</button><button class="rh-btn" data-action="nfc-scan" ${!ready || s.nfcBusy ? 'disabled' : ''}>${icon('scan')}Etiketi oku</button>${btn('İçeriği kopyala', 'nfc-copy', false, 'copy')}${s.nfcBusy ? btn('Durdur', 'nfc-stop', false, 'close') : ''}</div><div class="rh-notice ${s.nfcMessage ? '' : 'success'}" id="rh-nfc-status" role="status">${esc(s.nfcMessage || (ready ? 'Tarayıcı Web NFC sunuyor. Gerçek donanım ve etiket uygunluğu işlem sırasında doğrulanır.' : 'Bu tarayıcıda NFC yazma kullanılamıyor. İçeriği hazırlayabilirsin; yazmak için HTTPS üzerinden NFC destekli Android telefonda Chrome ile aç.'))}</div><p class="rh-helper">Bu sürümde kalıcı kilitleme ve toplu yazım yoktur. WiFi/WSC yazımı için mevcut projedeki NDEF modülü kullanılmalıdır.</p></section><aside class="rh-nfc-right"><div class="rh-device-preview"><div class="rh-phone" aria-label="Temsili Android önizlemesi"><span class="rh-phone-camera"></span><span class="rh-phone-status">9:41</span><img src="${asset('logo.svg')}" alt=""/><h3>Dokun, bağlantı kur.</h3><p id="rh-nfc-preview">İçeriğini hazırlamaya başla.</p><div class="rh-wave">Temsili telefon önizlemesi</div></div><div class="rh-nfc-tag"><img src="${asset('logo.svg')}" alt="Renderhane etiket tasarım örneği"/></div></div><div class="rh-nfc-live-status"><div class="rh-icon-tile">${icon(ready ? 'nfc' : 'info')}</div><div><strong>${ready ? 'Tarayıcı desteği var' : 'Önce cihaz uyumluluğu'}</strong><p>${ready ? 'Yazmak için etiketi telefona yaklaştır.' : 'NFC donanımı, Chrome ve HTTPS gerekir.'}</p></div></div><div class="rh-compat"><div>${icon('phone')}<section><strong>Android + Chrome</strong><p>Web NFC ve cihaz NFC donanımı gerekli. İşlem için izin istenir.</p></section></div><div>${icon('info')}<section><strong>iPhone tarayıcısı</strong><p>Buradan etikete yazma sunulmaz. Etiket okuma cihaz ve içerikle değişir.</p></section></div></div></aside></div>${benefits([['link', 'İçeriği açıkça gör', 'Yazmadan önce bağlantıyı ve iletişim bilgilerini kontrol et.'], ['lock', 'İzin senin kontrolünde', 'Üzerine yazma seçeneği varsayılan olarak kapalıdır.'], ['phone', 'Cihazı önce kontrol et', 'Tarayıcı desteği, fiziksel donanım garantisi değildir.'], ['nfc', 'Gerçek donanım bağlantısı', 'Yazma başarı mesajı ancak cihaz onayından sonra gelir.']])}${ideaSection('nfc')}</main>`; }
  function render(focus = false): void {
    if (disposed) return;
    viewCleanup?.(); viewCleanup = undefined;
    const approvedHome = s.page === 'home' && options.homeMarkup !== undefined;
    root.classList.toggle('rh-app', !approvedHome);
    const content = s.page === 'home' ? home() : s.page === 'background' ? background() : s.page === 'scenes' ? scenesView() : s.page === 'qr' ? qrView() : s.page === 'artistic' ? artisticView() : s.page === 'tools' ? toolsView() : nfcView();
    root.innerHTML = approvedHome ? options.homeMarkup! :
      (options.chrome === false ? '' : options.headerMarkup ?? header()) + content +
      (options.chrome === false ? '' : options.footerMarkup ?? footer()) +
      '<div class="rh-toast" role="status" aria-live="polite" id="rh-toast"></div>';
    if (options.pageHref) $$<HTMLAnchorElement>('a[data-page]').forEach(a => {
      a.href = options.pageHref!(a.dataset.page as Page);
    });
    doc.title = `${pageNames[s.page]} · Renderhane`;
    root.dataset.currentPage = s.page;
    $$<HTMLAnchorElement>('[data-page]').forEach(a => { if(a.dataset.page === s.page) a.setAttribute('aria-current','page'); });
    if (s.page === 'qr') void updateQr(); if (s.page === 'nfc') updateNfcPreview();
    viewCleanup = options.onRender?.(s.page) || undefined;
    if (focus) $(approvedHome ? '#rhl-main' : '#rh-main')?.focus({ preventScroll: true });
  }
  function toast(message: string): void { const el = $('#rh-toast'); if (!el) return; win.clearTimeout(toastTimer); el.textContent = message; el.classList.add('show'); toastTimer = win.setTimeout(() => el.classList.remove('show'), 4200); }
  function stopNfc(): void { nfcAbort?.abort(); nfcAbort = null; win.clearTimeout(nfcTimer); s.nfcBusy = false; }
  function navigate(page: Page): void {
    if (!pages.includes(page)) return;
    stopNfc(); request?.abort(); request = null; s.busy = false; s.menu = false; s.tools = false; s.bgMessage = '';
    if (options.onNavigate) { options.onNavigate(page); return; }
    s.page = page; win.history.pushState(null, '', `#${page}`); render(true); win.scrollTo({ top: 0, behavior: 'instant' });
  }
  function replaceFile(file: File | null, url: string | null): void { if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = url; s.file = file; s.fileUrl = url; s.result = null; s.scenes = null; s.bgMessage = ''; s.tab = 'compare'; }
  async function handleFile(file: File): Promise<void> {
    const ticket = ++uploadTicket;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Yalnızca JPG, PNG veya WebP yükleyin.');
      if (file.size > MAX_FILE) throw Error('Dosya 5 MB sınırını aşıyor.');
      const url = URL.createObjectURL(file);
      try { const img = await imageLoaded(url); if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) throw Error('Görsel çok büyük: en fazla 24 megapiksel.'); if (disposed || ticket !== uploadTicket) { URL.revokeObjectURL(url); return; } request?.abort(); s.busy = false; replaceFile(file, url); if (s.page === 'home') navigate('background'); else render(); toast('Fotoğraf yalnızca bu tarayıcıya yüklendi.'); }
      catch (error) { URL.revokeObjectURL(url); throw error; }
    } catch (error) { toast(error instanceof Error ? error.message : 'Dosya açılamadı.'); }
  }
  function qrKey(): string { return JSON.stringify([s.qrType, s.qr, s.qrColor, s.qrSize, s.qrStyle]); }
  function qrStatus(state: string, title: string, detail: string): void {
    // Text first, state attribute LAST: observers (tests, users) acting on
    // the state change must see settled layout, or clicks can split across
    // a mid-click layout shift and get lost.
    const a = $('#rh-qr-check-title'), b = $('#rh-qr-check-detail');
    if (a) a.textContent = title;
    if (b) b.textContent = detail;
    const el = $('#rh-qr-check');
    if (el) el.dataset.state = state;
  }
  function invalidateQr(): void {
    qrRevision++;
    qrController?.abort();
    qrController = null;
    qrValidated = null;
    qrValidatedKey = '';
    $$<HTMLButtonElement>('[data-action="qr-png"],[data-action="qr-svg"]').forEach(b => b.disabled = true);
    qrStatus('pending', 'Yeniden kontrol ediliyor', 'Girdi değişti. Önceki onay artık geçerli değil.');
  }
  function scheduleQr(): void {
    // Same key already scheduled or validated: skip. Revalidating identical
    // input only disables the buttons and can eat an in-flight click.
    if (qrKey() === lastQrKey) return;
    invalidateQr(); win.clearTimeout(qrTimer); qrTimer = win.setTimeout(() => void updateQr(), 200);
  }
  async function updateQr(): Promise<void> {
    if (disposed || s.page !== 'qr') return;
    invalidateQr();
    const revision = qrRevision, controller = new AbortController();
    qrController = controller;
    const key = qrKey();
    lastQrKey = key;
    const current = (): boolean => !disposed && s.page === 'qr' && !controller.signal.aborted && revision === qrRevision && key === qrKey();
    const errorEl = $('#rh-qr-error');
    try {
      const payload = buildPayload(s.qrType, s.qr);
      const artifact = buildQrArtifact(payload, s.qrColor, s.qrSize, s.qrStyle);
      s.qrSvg = artifact.svg;
      s.qrPayload = payload;
      s.qrError = '';
      const svgEl = $('#rh-qr-svg');
      if (svgEl) svgEl.innerHTML = artifact.svg;
      const text = $('#rh-qr-payload');
      if (text) text.textContent = s.qrType === 'wifi' ? 'WiFi QR kodu ağ adını ve şifresini içerir. Şifre bu önizlemede gizlendi.' : payload;
      const label = $('#rh-qr-style-label');
      if (label) label.textContent = (QR_PRESETS.find(p => p.id === s.qrStyle) ?? QR_PRESETS[0]).label;
      const meta = $('#rh-qr-meta');
      if (meta) meta.textContent = `${artifact.size} × ${artifact.size} px · ${artifact.modules} × ${artifact.modules} modül · H · 4 modül kenar`;
      if (errorEl) errorEl.hidden = true;
      $('#rh-qr-stage')?.setAttribute('data-invalid', 'false');
      qrStatus('pending', 'Dijital veri kontrolü sürüyor', 'SVG görüntüleniyor; QR verisi ve hata kontrolü sınanıyor.');
      // Verify the same-payload classic baseline, then the selected visual style.
      if (s.qrStyle !== 'square') await validateQrRaster(buildQrArtifact(payload, s.qrColor, s.qrSize, 'square'), controller.signal);
      const validated = await validateQrRaster(artifact, controller.signal);
      if (!current()) return;
      qrValidated = validated;
      qrValidatedKey = key;
      qrStatus('passed', 'Dijital veri kontrolü geçti', `${validated.report.passed}/${validated.report.total} kontrol · İçerik birebir eşleşti · ${s.qrStyle === 'square' ? 'Klasik QR' : 'Klasik karşılaştırma da geçti'}`);
      $$<HTMLButtonElement>('[data-action="qr-png"],[data-action="qr-svg"]').forEach(b => b.disabled = false);
    } catch (err) {
      if (!current()) return;
      qrValidated = null;
      qrValidatedKey = '';
      s.qrSvg = '';
      s.qrPayload = '';
      s.qrError = err instanceof Error ? err.message : 'QR doğrulanamadı.';
      if (errorEl) { errorEl.textContent = s.qrError; errorEl.hidden = false; }
      qrStatus('failed', 'İndirme kapalı', s.qrError);
      $('#rh-qr-stage')?.setAttribute('data-invalid', 'true');
      const svgEl = $('#rh-qr-svg');
      if (svgEl) svgEl.innerHTML = `<div class="rh-empty" style="min-height:220px">${icon('shield')}<p>Bu ayarla çıktı onaylanmadı.</p><small>İçeriği, rengi veya boyutu değiştir.</small></div>`;
      const payloadEl = $('#rh-qr-payload');
      if (payloadEl) payloadEl.textContent = 'Doğrulanmış çıktı bekleniyor.';
      const meta = $('#rh-qr-meta');
      if (meta) meta.textContent = 'Kontrol başarısız. Otomatik olarak başka şekle geçilmedi.';
      $$<HTMLButtonElement>('[data-action="qr-png"],[data-action="qr-svg"]').forEach(b => b.disabled = true);
    }
  }
  function updateNfcPreview(): void { const el = $('#rh-nfc-preview'); if (!el) return; try { el.textContent = s.nfcType === 'wifi' ? 'WiFi içeriği · yazım bu sürümde kapalı' : buildPayload(s.nfcType, s.nfc); } catch { el.textContent = 'İçeriğini tamamla.'; } }
  async function removeBackground(): Promise<void> {
    if (!s.file) { s.tab = 'result'; render(); toast('Hazır örnek çıktı gösteriliyor. Bu işlem AI çağrısı değildir.'); return; }
    const adapter = options.adapters?.removeBackground;
    if (!adapter) { toast('Fotoğraf önizleniyor. Gerçek işlem için removeBackground API adaptörünü bağla.'); return; }
    const controller = new AbortController(); request?.abort(); request = controller; s.busy = true; s.bgMessage = ''; render();
    try { const result = await adapter(s.file, controller.signal); if (disposed || controller.signal.aborted) return; assertImageUrl(result.url); s.result = result.url; s.remaining = result.remaining ?? null; s.tab = 'compare'; s.bgMessage = 'İşlem tamamlandı. Sonucu kontrol ederek indir.'; }
    catch (error) { if (!controller.signal.aborted) s.bgMessage = error instanceof Error ? error.message : 'İşlem başarısız oldu.'; }
    finally { if (request === controller) { s.busy = false; request = null; if (!disposed && s.page === 'background') render(); } }
  }
  async function generateScenes(): Promise<void> {
    const adapter = options.adapters?.generateScenes;
    if (!adapter || !s.file) { if (s.file && !adapter) toast('Yüklediğin fotoğraftan AI sahnesi üretilmedi; hazır örnekler gösteriliyor.'); else toast('Önceden hazırlanmış kompozisyonlar gösteriliyor.'); return; }
    if (!s.prompt.trim()) { toast('Sahne açıklamasını gir.'); return; }
    const controller = new AbortController(); request?.abort(); request = controller; s.busy = true; s.bgMessage = ''; render();
    try { const result = await adapter(s.file, s.prompt, controller.signal); if (disposed || controller.signal.aborted) return; if (!result.length) throw Error('API bir sahne döndürmedi.'); result.forEach(x => assertImageUrl(x.url)); s.scenes = result; s.bgMessage = 'API sonuçları hazır. Ayrıntıları kontrol et.'; }
    catch (error) { if (!controller.signal.aborted) s.bgMessage = error instanceof Error ? error.message : 'Üretim başarısız oldu.'; }
    finally { if (request === controller) { request = null; s.busy = false; if (!disposed && s.page === 'scenes') render(); } }
  }
  async function exportImage(src: string, fileName: string, color = 'transparent'): Promise<void> {
    try {
      let url = src; let temp: string | null = null;
      // Data URLs and object URLs are local. Remote API outputs need CORS-permitted fetches.
      if (/^https?:/.test(src)) { const response = await fetch(src, { credentials: 'omit' }); if (!response.ok) throw Error('Çıktı indirilemedi. Sunucu CORS ve indirme izinlerini kontrol edin.'); temp = URL.createObjectURL(await response.blob()); url = temp; }
      try { const image = await imageLoaded(url); const canvas = doc.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const c = canvas.getContext('2d'); if (!c) throw Error('Canvas desteklenmiyor.'); if (color !== 'transparent') { c.fillStyle = color; c.fillRect(0, 0, canvas.width, canvas.height); } c.drawImage(image, 0, 0); downloadBlob(await canvasBlob(canvas), fileName); }
      finally { if (temp) URL.revokeObjectURL(temp); }
    } catch (error) { toast(error instanceof Error ? error.message : 'İndirme başarısız.'); }
  }
  async function exportQr(kind: 'svg' | 'png'): Promise<void> {
    if (!qrValidated || qrValidatedKey !== qrKey() || disposed || s.page !== 'qr') {
      toast('Güncel çıktının kontrolleri tamamlanmadan indirme yapılamaz.');
      return;
    }
    const artifact = qrValidated.artifact;
    // Export EXACTLY the validated immutable bytes/raster; do not regenerate here.
    const blob = kind === 'svg' ? new Blob([artifact.svg], { type: 'image/svg+xml;charset=utf-8' }) : qrValidated.png;
    downloadBlob(blob, `renderhane-qr-${s.qrType}-${artifact.style}.${kind}`);
  }
  async function nfcAction(mode: 'write' | 'scan'): Promise<void> {
    if (!supportedNfc() || !win.NDEFReader) { toast('NFC destekli Android, Chrome ve HTTPS gerekir.'); return; }
    if (mode === 'write' && s.nfcType === 'wifi') { toast('WiFi/WSC yazımı bu sürümde kapalı.'); return; }
    let payload = '';
    try { if (mode === 'write') payload = buildPayload(s.nfcType, s.nfc); } catch (error) { toast(error instanceof Error ? error.message : 'İçeriği kontrol edin.'); return; }
    stopNfc(); const controller = new AbortController(); nfcAbort = controller; s.nfcBusy = true; s.nfcMessage = mode === 'write' ? 'Etiketi telefonun arkasına yaklaştır. Yazma tamamlanana kadar uzaklaştırma.' : 'Okumak istediğin etiketi yaklaştır.'; render();
    nfcTimer = win.setTimeout(() => { if (nfcAbort === controller) { controller.abort(); s.nfcBusy = false; s.nfcMessage = '20 saniye içinde etiket algılanmadı. İşlemi yeniden başlatabilirsin.'; render(); } }, 20_000);
    try {
      const reader = new win.NDEFReader();
      if (mode === 'write') {
        let records: NFCRecord[];
        if (s.nfcType === 'vcard') records = [{ recordType: 'mime', mediaType: 'text/vcard', data: new TextEncoder().encode(payload) }];
        else if (s.nfcType === 'text') records = [{ recordType: 'text', lang: 'tr', data: payload }];
        else if (s.nfcType === 'app') records = [{ recordType: 'url', data: payload }, { recordType: 'android.com:pkg', data: new TextEncoder().encode(s.nfc.package) }];
        else records = [{ recordType: 'url', data: payload }];
        await reader.write({ records }, { signal: controller.signal, overwrite: s.nfcOverwrite });
        if (!controller.signal.aborted && !disposed) { s.nfcMessage = 'Etiket yazıldı. Kullanacağın cihazla okuyarak test et.'; stopNfc(); render(); }
      } else {
        reader.onreading = event => { if (disposed || controller.signal.aborted) return; const parts = event.message.records.map(record => { try { return new TextDecoder(record.encoding || 'utf-8').decode(record.data); } catch { return `[${record.recordType}: ikili veri]`; } }); s.nfcMessage = 'Etiket okundu: ' + parts.join(' / '); stopNfc(); render(); };
        reader.onreadingerror = () => { if (!disposed) { s.nfcMessage = 'Etiket okunamadı. Biçim veya yakınlığı kontrol et.'; stopNfc(); render(); } };
        await reader.scan({ signal: controller.signal });
      }
    } catch (error) {
      if (!controller.signal.aborted && !disposed) { const name = error instanceof Error ? error.name : ''; const reason = error instanceof Error ? error.message : 'Bilinmeyen hata'; s.nfcMessage = name === 'NotAllowedError' ? 'NFC izni verilmedi. İzinleri kontrol ederek tekrar dene.' : name === 'NotSupportedError' ? 'Cihaz veya etiket bu işlemi desteklemiyor.' : `NFC işlemi tamamlanmadı: ${reason}`; stopNfc(); render(); }
    }
  }
  async function copyNfc(): Promise<void> {
    try { if (!win.navigator.clipboard?.writeText) throw Error('Panoya erişim için HTTPS veya localhost gerekir.'); const text = buildPayload(s.nfcType, s.nfc); if (s.nfcType === 'wifi') throw Error('WiFi şifresini kopyalamak yerine QR aracını kullan.'); await win.navigator.clipboard.writeText(text); toast('İçerik panoya kopyalandı.'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Kopyalama için HTTPS veya localhost gerekir.'); }
  }
  function onClick(event: Event): void {
    const target = (event.target as Element).closest<HTMLElement>('[data-page],[data-action],[data-anchor],[data-hero],[data-view],[data-bg],[data-preset],[data-qr-type],[data-nfc-type],[data-qr-style],[data-download-scene],[data-idea-filter],[data-idea],[data-idea-close],[data-idea-more]');
    if (!target || target === root || !root.contains(target)) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    if (event instanceof MouseEvent && target instanceof HTMLAnchorElement && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    event.preventDefault();
    if ((s.page === 'qr' || s.page === 'nfc') && (target.hasAttribute('data-idea') || target.hasAttribute('data-idea-filter') || target.hasAttribute('data-idea-close') || target.hasAttribute('data-idea-more'))) {
      const channel = s.page as IdeaChannel; const state = s.ideas[channel];
      if (target.hasAttribute('data-idea-filter')) {
        const cat = target.dataset.ideaFilter || 'all';
        if (cat !== 'all' && !(cat in IDEA_CATEGORIES)) return;
        state.category = cat; state.expanded = false; state.selected = null;
        refreshIdeas(`[data-idea-filter="${cat}"]`);
      } else if (target.hasAttribute('data-idea-more')) {
        state.expanded = !state.expanded; state.selected = null;
        refreshIdeas('[data-idea-more]');
      } else if (target.hasAttribute('data-idea-close')) {
        const previous = state.selected; state.selected = null;
        refreshIdeas(previous ? `[data-idea="${previous}"]` : undefined);
      } else {
        const idea = getInspirationIdea(channel, target.dataset.idea || '');
        if (!idea) return;
        state.selected = idea.id;
        refreshIdeas('#rh-idea-detail', true);
      }
      return;
    }
    if (target.dataset.page) { navigate(target.dataset.page as Page); return; }
    if (target.dataset.anchor) {
      const requested = target.dataset.anchor;
      const id = options.homeMarkup ? (({examples:'rhl-example',faq:'rhl-scope',how:'rhl-paths'} as Record<string,string>)[requested] || requested) : requested;
      if (options.onAnchor) { stopNfc(); request?.abort(); options.onAnchor(id); return; }
      if (s.page !== 'home') {
        stopNfc(); request?.abort(); request = null; s.busy = false; s.page = 'home'; s.menu = s.tools = false;
        if (historyEnabled) win.history.pushState(null, '', '#' + id); render();
      }
      // ID values are from our fixed templates; no user field is interpolated.
      const el = doc.getElementById(id);
      if (el && root.contains(el)) el.scrollIntoView({behavior:win.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      s.menu = s.tools = false; $('.rh-nav')?.classList.remove('open'); return;
    }
    if (target.dataset.hero !== undefined) { s.hero = Number(target.dataset.hero); const img = $<HTMLImageElement>('#rh-hero-photo'); if (img) img.src = asset(s.hero < 0 ? 'photo.jpg' : `scene-${s.hero}.jpg`); const badge = $('#rh-hero-badge'); if (badge) badge.textContent = s.hero < 0 ? 'Temsili şişe görseli' : 'Hazırlanmış kompozisyon'; $$('[data-hero]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.hero) === s.hero))); return; }
    if (target.dataset.view) { s.tab = target.dataset.view; const el = $('#rh-canvas'); if (el) el.innerHTML = compareCanvas(); return; }
    if (target.dataset.bg) { s.bgColor = target.dataset.bg; const el = $('#rh-canvas'); if (el) el.innerHTML = compareCanvas(); $$('[data-bg]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bg === s.bgColor))); return; }
    if (target.dataset.preset !== undefined) { s.scenePreset = Number(target.dataset.preset); s.prompt = scenePrompts[s.scenePreset]; const prompt = $<HTMLTextAreaElement>('#rh-prompt'); if (prompt) prompt.value = s.prompt; $$('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.preset) === s.scenePreset))); $$('.rh-scene').forEach((e, i) => e.setAttribute('data-active', String(i === s.scenePreset))); return; }
    if (target.dataset.qrType || target.dataset.nfcType) { const kind = target.dataset.qrType ? 'qr' : 'nfc'; const type = (target.dataset.qrType || target.dataset.nfcType) as ContentType; if (!Object.hasOwn(contentLabels, type)) return; if (kind === 'nfc') stopNfc(); s[`${kind}Type`] = type; render(); $(`#rh-${kind}-fields input, #rh-${kind}-fields textarea`)?.focus({ preventScroll: true }); return; }
    if (target.dataset.qrStyle) {
      if (!isQrStyle(target.dataset.qrStyle)) return;
      s.qrStyle = target.dataset.qrStyle;
      $$('button[data-qr-style]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-qr-style') === s.qrStyle)));
      scheduleQr();
      return;
    }
    if (target.dataset.downloadScene !== undefined) { const i = Number(target.dataset.downloadScene); const scene = s.scenes?.[i]; void exportImage(scene?.url || asset(`scene-${i}.jpg`), `renderhane-sahne-${i + 1}.png`); return; }
    switch (target.dataset.action) {
      case 'open-composer': {
        if (!manualComposer)
          manualComposer = createManualComposer(root, {
            sampleProduct: asset('cutout.png'),
            verifyMember: options.verifyComposerMember,
            loginUrl: options.composerLoginUrl || 'https://www.renderhane.com/tr/login',
            allowDemoMembership: options.demoComposerMembership === true,
          });
        manualComposer.open(s.result || s.fileUrl || asset('cutout.png'), s.result ? 'Dekupe API sonucu' : s.file ? `${s.file.name} · arka plan otomatik silinmedi` : 'Hazır şişe · temsili dekupe');
        break;
      }
      case 'brief-focus': $('#rh-brief-brand')?.focus(); $('#rh-brief-form')?.scrollIntoView({behavior:'smooth',block:'start'}); break;
      case 'menu': { s.menu = !s.menu; $('.rh-nav')?.classList.toggle('open', s.menu); target.setAttribute('aria-expanded', String(s.menu)); target.innerHTML = icon(s.menu ? 'close' : 'menu'); break; }
      case 'tools': { s.tools = !s.tools; const menu = $('#rh-tool-menu'); if (menu) menu.hidden = !s.tools; target.setAttribute('aria-expanded', String(s.tools)); break; }
      case 'upload-open': $('input[data-file]')?.dispatchEvent(new MouseEvent('click',{bubbles:false})); break;
      case 'sample': request?.abort(); uploadTicket++; replaceFile(null, null); s.busy = false; render(); break;
      case 'remove': void removeBackground(); break;
      case 'download-bg': if (!s.file || s.result) void exportImage(s.result || asset('cutout.png'), s.result ? 'renderhane-sonuc.png' : 'renderhane-hazir-ornek.png', s.bgColor); break;
      case 'generate-scenes': void generateScenes(); break;
      case 'qr-png': void exportQr('png'); break;
      case 'qr-svg': void exportQr('svg'); break;
      case 'nfc-write': void nfcAction('write'); break;
      case 'nfc-scan': void nfcAction('scan'); break;
      case 'nfc-copy': void copyNfc(); break;
      case 'nfc-stop': stopNfc(); s.nfcMessage = 'İşlem durduruldu.'; render(); break;
    }
  }
  function onInput(event: Event): void {
    const el = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (el.dataset.brief) { s.brief[el.dataset.brief]=el.value; return; }
    if (el.dataset.compare) { const parent = el.closest<HTMLElement>('.rh-compare'); parent?.style.setProperty('--split', `${el.value}%`); return; }
    if (el.dataset.field && (el.dataset.kind === 'qr' || el.dataset.kind === 'nfc')) { const kind = el.dataset.kind; s[kind][el.dataset.field] = el.value; if (kind === 'qr') { scheduleQr(); } else updateNfcPreview(); return; }
    if (el.dataset.prompt) s.prompt = el.value;
    if (el.id === 'rh-qr-color') { s.qrColor = el.value; const text = $('#rh-qr-hex'); if (text) text.textContent = el.value; scheduleQr(); return; }
    if (el.id === 'rh-qr-size') { s.qrSize = Number(el.value); scheduleQr(); return; }
    if (el.id === 'rh-nfc-overwrite') s.nfcOverwrite = (el as HTMLInputElement).checked;
  }
  function onSubmit(event: SubmitEvent): void {
    const form=event.target as HTMLFormElement;
    if (form.id === 'rh-idea-form') {
      event.preventDefault();
      if (s.page !== 'qr' && s.page !== 'nfc') return;
      const status=$('#rh-idea-form-status');
      try {
        const channel = s.page as IdeaChannel;
        const idea = getInspirationIdea(channel, form.dataset.ideaId || '');
        if (!idea?.canApply || s.ideas[channel].selected !== idea.id) throw Error('Bu fikir yalnızca kurulum rehberidir.');
        const data = new FormData(form);
        const value = validateIdeaUrl(String(data.get('url') || ''));
        if (data.get('confirm') !== 'on') throw Error('Mevcut içeriği değiştirmek için onay kutusunu işaretle.');
        // Sayfa istegi, is gonderimi veya NFC yazimi yok; yalnizca ilgili alan degisir.
        if (channel === 'qr') { s.qrType = 'url'; s.qr = {url: value}; }
        else { stopNfc(); s.nfcType = 'url'; s.nfc = {url: value}; s.nfcOverwrite = false; s.nfcMessage = 'Bağlantı hazırlandı. Etikete henüz yazılmadı.'; }
        s.ideas[channel].selected = null;
        render();
        const field = $(`#rh-${channel}-url`);
        field?.focus({preventScroll:true});
        (field as HTMLElement | null)?.scrollIntoView({block:'center'});
        toast(channel === 'qr' ? 'Bağlantı aktarıldı. Yeni QR kontrol ediliyor.' : 'Bağlantı aktarıldı. Yazma için ayrıca etiket ve onay gerekir.');
      } catch(error) { if(status) status.textContent = error instanceof Error ? error.message : 'Bağlantıyı kontrol et.'; }
      return;
    }
    if (form.id !== 'rh-brief-form') return;
    event.preventDefault();
    const status=$('#rh-brief-status');
    try {
      const text=buildArtisticBrief(s.brief);
      downloadBlob(new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8'}),'Renderhane_Sanatsal_QR_Tasarim_Talebi.txt');
      if(status) {status.textContent='Talep taslağı indirildi. Başvuru gönderilmedi; ödeme alınmadı.';status.classList.remove('error');}
    } catch(error) {if(status) {status.textContent=error instanceof Error ? error.message : 'Talep hazırlanamadı.';status.classList.add('error');}}
  }
  function onChange(event: Event): void { const el = event.target as HTMLInputElement; if (el.dataset.file && el.files?.[0]) void handleFile(el.files[0]); else onInput(event); }
  function onDrag(event: DragEvent): void { const zone = (event.target as Element).closest<HTMLElement>('[data-upload-zone]'); if (!zone) return; event.preventDefault(); if (event.type === 'dragover') zone.classList.add('dragover'); else zone.classList.remove('dragover'); if (event.type === 'drop' && event.dataTransfer?.files[0]) void handleFile(event.dataTransfer.files[0]); }
  function onKey(event: KeyboardEvent): void { if (event.key === 'Escape') { s.menu = s.tools = false; $('.rh-nav')?.classList.remove('open'); const menu = $('#rh-tool-menu'); if (menu) menu.hidden = true; $$('[aria-controls="rh-nav"],[aria-controls="rh-tool-menu"]').forEach(e => e.setAttribute('aria-expanded', 'false')); if (s.nfcBusy) { stopNfc(); s.nfcMessage = 'İşlem durduruldu.'; render(); } } if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).matches('[data-upload-zone]')) { event.preventDefault(); (event.target as HTMLElement).querySelector<HTMLInputElement>('input')?.click(); } }
  function onOutside(event: Event): void { if (s.tools && !(event.target as Element).closest('.rh-nav-group')) { s.tools = false; const menu = $('#rh-tool-menu'); if (menu) menu.hidden = true; $('[data-action="tools"]')?.setAttribute('aria-expanded', 'false'); } }
  function onHash(): void { const page = fromHash(); if (page !== s.page) { stopNfc(); request?.abort(); s.page = page; s.busy = false; render(true); } }
  function onVisibility(): void { if (doc.hidden && s.nfcBusy) { stopNfc(); s.nfcMessage = 'Sayfa arka plana geçtiği için NFC işlemi durduruldu.'; render(); } }
  root.addEventListener('submit', onSubmit); root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange); root.addEventListener('keydown', onKey); root.addEventListener('dragover', onDrag); root.addEventListener('dragleave', onDrag); root.addEventListener('drop', onDrag); doc.addEventListener('click', onOutside); doc.addEventListener('visibilitychange', onVisibility); if (historyEnabled) { win.addEventListener('hashchange', onHash); win.addEventListener('popstate', onHash); }
  render();
  return () => { viewCleanup?.(); viewCleanup = undefined; manualComposer?.dispose(); manualComposer = null; disposed = true; uploadTicket++; request?.abort(); stopNfc(); win.clearTimeout(toastTimer); win.clearTimeout(qrTimer); if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl); root.removeEventListener('submit', onSubmit); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKey); root.removeEventListener('dragover', onDrag); root.removeEventListener('dragleave', onDrag); root.removeEventListener('drop', onDrag); doc.removeEventListener('click', onOutside); doc.removeEventListener('visibilitychange', onVisibility); win.removeEventListener('hashchange', onHash); win.removeEventListener('popstate', onHash); root.replaceChildren(); };
}
function assertImageUrl(url: string): void {
  if (url.startsWith('data:image/png;base64,') || url.startsWith('data:image/jpeg;base64,') || url.startsWith('data:image/webp;base64,') || url.startsWith('blob:')) return;
  const parsed = new URL(url, window.location.origin);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('API geçersiz bir görsel adresi döndürdü.');
}
