/**
 * QR uretim + dogrulama cekirdegi (saf moduller, DOM bagimsiz).
 * core.ts motor gorunumu + pazarlama sayfalari tarafindan ortak kullanilir.
 * SSR guvenligi: LocalQR vendor'u import aninda DEGIL, ilk kullanimda
 * tembel yuklenir (saf yardimcilar sunucuda da calisir).
 */
type QrVendor = Pick<ToolWindow, 'LocalQR' | 'LocalQRTools'>;
let vendorPromise: Promise<QrVendor> | null = null;
function vendor(): Promise<QrVendor> {
  if (typeof window === 'undefined') throw Error('QR uretimi yalnizca tarayicida calisir.');
  const w = window as unknown as ToolWindow;
  if (w.LocalQR && w.LocalQRTools) return Promise.resolve(w);
  vendorPromise ??= import('./vendor/qr-core.js').then(() => window as unknown as ToolWindow);
  return vendorPromise;
}

interface QRModel { addData(v: string): void; addUtf8Eci(): void; make(): void; getModuleCount(): number; isDark(r: number, c: number): boolean }
interface QrRsBlock { totalCount: number; dataCount: number }
interface QrTools {
  rsBlocks(v: number, l: number): QrRsBlock[];
  functionGrid(v: number, l: number, m: number): (boolean | null)[][];
}
// Local browser shape, not a global Window declaration: avoids colliding with
// the host project's existing NFC/QR typings when the preview is installed.
type ToolWindow = Window & {
  LocalQR: new (version: number, level: number) => QRModel;
  LocalQRTools: QrTools;
};
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]!));

export type QrStyle = 'square' | 'rounded' | 'dots' | 'diamond' | 'star';

export interface QrArtifact {
  svg: string;
  size: number;
  modules: number;
  version: number;
  style: QrStyle;
  matrix: boolean[][];
  functional: boolean[][];
  payload: string;
}

export interface QrVerifyReport {
  revision: string;
  svgPixels: number;
  reducedPixels: number;
  passed: number;
  total: number;
  tests: string[];
  scope: string;
  timeMs: number;
}

export interface QrValidated {
  artifact: QrArtifact;
  png: Blob;
  report: QrVerifyReport;
}

export interface QrDecodeResult {
  text: string;
  bytes: Uint8Array;
  version: number;
  mask: number;
  correctionLevel: number;
  eci: number | null;
}

/**
 * Preset QR renderer + strict ALIGNED raster verifier.
 * Not a general camera detector, ISO certification, or physical scan guarantee.
 * The verifier reads format bits, unmasks pixels, deinterleaves codewords,
 * verifies Reed–Solomon parity WITHOUT correction and decodes UTF-8 bytes.
 * Only the final decoded bytes are compared to the requested payload.
 */
export const QR_PRESETS: { id: QrStyle; label: string; hint: string }[] = [
  { id: 'square', label: 'Klasik', hint: 'Tam kare' },
  { id: 'rounded', label: 'Yumuşak', hint: 'Yuvarlak köşe' },
  { id: 'dots', label: 'Nokta', hint: 'Dolu daire' },
  { id: 'diamond', label: 'Elmas', hint: 'Dolu baklava' },
  { id: 'star', label: 'Yıldız', hint: 'Kalın merkez' },
];
const QR_CHECK_REVISION = 'aligned-utf8-eci-no-correction-2';
export function isQrStyle(v: unknown): v is QrStyle { return QR_PRESETS.some(p => p.id === v); }
export function qrContrast(color: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error('Geçersiz QR rengi.');
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return 1.05 / (.2126 * r + .7152 * g + .0722 * b + .05);
}
/** UI policy (not an ISO contrast threshold): dark ink on opaque white. */
export function validateQrOptions(payload: string, color: string, pixels: number, style: string): void {
  if (!isQrStyle(style)) throw Error('Bilinmeyen QR şekli.');
  if (!payload || new TextEncoder().encode(payload).length > 1200) throw Error('İçerik boş olamaz; en fazla 1200 UTF-8 bayt kullanın.');
  if (!Number.isInteger(pixels) || pixels < 256 || pixels > 2048) throw Error('Çıktı boyutu 256–2048 piksel olmalı.');
  if (qrContrast(color) < 7) throw Error('Daha koyu bir renk seçin. Bu sürümün renk kuralı beyaz zeminde en az 7:1 kontrasttır.');
}
function fmt(v: number): string { return Number(v.toFixed(4)).toString(); }
export function presetPath(style: QrStyle, x = 0, y = 0): string {
  const X = (v: number): string => fmt(x + v), Y = (v: number): string => fmt(y + v);
  if (style === 'square') return `M${X(0)} ${Y(0)}h1v1h-1z`;
  if (style === 'rounded') return `M${X(.18)} ${Y(0)}h.64q.18 0 .18.18v.64q0 .18-.18.18h-.64q-.18 0-.18-.18v-.64q0-.18 .18-.18z`;
  if (style === 'dots') return `M${X(.99)} ${Y(.5)}a.49 .49 0 1 0-.98 0a.49 .49 0 1 0 .98 0z`;
  if (style === 'diamond') return `M${X(.5)} ${Y(0)}L${X(1)} ${Y(.5)}L${X(.5)} ${Y(1)}L${X(0)} ${Y(.5)}Z`;
  let out = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .365 : .5;
    out += `${i ? 'L' : 'M'}${X(.5 + Math.cos(a) * r)} ${Y(.5 + Math.sin(a) * r)}`;
  }
  return out + 'Z';
}
export function presetIcon(style: QrStyle): string { return `<svg viewBox="-.08 -.08 1.16 1.16" aria-hidden="true"><path d="${presetPath(style)}" fill="currentColor"/></svg>`; }
export async function buildQrArtifact(payload: string, color = '#0b0f2d', pixels = 1024, style: QrStyle = 'square', locale: 'tr' | 'en' = 'tr'): Promise<QrArtifact> {
  validateQrOptions(payload, color, pixels, style);
  const v = await vendor();
  const qr = new (v.LocalQR)(-1, 2); // LocalQR 2 = error correction H.
  qr.addUtf8Eci();
  qr.addData(Array.from(new TextEncoder().encode(payload), v => String.fromCharCode(v)).join(''));
  qr.make();
  const n = qr.getModuleCount(), version = (n - 17) / 4, span = n + 8, minimum = style === 'square' ? 4 : 6;
  if (pixels / span < minimum) throw Error(`Bu içerik için ${pixels}px küçük kalıyor. ${style === 'square' ? 'En az 4' : 'Stilli QR için en az 6'} piksel/modül gerekiyor; daha büyük çıktı seçin.`);
  const functional = v.LocalQRTools.functionGrid(version, 2, 0).map(row => row.map(v => v !== null));
  const matrix = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.isDark(y, x)));
  let fixed = '', shapes = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) {
    if (functional[y][x]) fixed += presetPath('square', x + 4, y + 4);
    else shapes += presetPath(style, x + 4, y + 4);
  }
  const label = (QR_PRESETS.find(p => p.id === style) ?? QR_PRESETS[0]).label;
  const englishLabel: Record<QrStyle, string> = { square: 'Classic', rounded: 'Soft', dots: 'Dots', diamond: 'Diamond', star: 'Star' };
  const accessibleLabel = locale === 'en' ? englishLabel[style] : label;
  const ariaLabel = locale === 'en' ? `${accessibleLabel}-style QR code` : `${label} biçimli QR kod`;
  const description = locale === 'en'
    ? 'Static QR code. Preserve the quiet zone and test it on the target print and phone.'
    : 'Statik QR. Boş kenarı koruyun; hedef baskı ve telefonda deneyin.';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ariaLabel}" width="${pixels}" height="${pixels}" viewBox="0 0 ${span} ${span}" data-qr-style="${style}" data-qr-version="${version}" data-qr-margin="4" data-qr-ecc="H"><title>Renderhane · ${accessibleLabel} QR</title><desc>${description}</desc><rect width="${span}" height="${span}" fill="#ffffff"/><path data-qr-functional="true" d="${fixed}" fill="${esc(color)}"/><path data-qr-data="true" d="${shapes}" fill="${esc(color)}"/></svg>`;
  return { svg, size: pixels, modules: n, version, style, matrix, functional, payload };
}
function bch(value: number, polynomial: number, shift: number, xor = 0): number {
  let r = value << shift;
  const degree = (v: number): number => 31 - Math.clz32(v);
  while (r && degree(r) >= degree(polynomial)) r ^= polynomial << (degree(r) - degree(polynomial));
  return ((value << shift) | r) ^ xor;
}
function maskBit(m: number, y: number, x: number): boolean {
  switch (m) {
    case 0: return (y + x) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (y + x) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return (y * x) % 2 + (y * x) % 3 === 0;
    case 6: return ((y * x) % 2 + (y * x) % 3) % 2 === 0;
    case 7: return ((y * x) % 3 + (y + x) % 2) % 2 === 0;
    default: throw Error('Maske geçersiz.');
  }
}
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gfMul = (a: number, b: number): number => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
/** No error correction is attempted: even a single failed syndrome rejects. */
function verifyRsBlock(block: number[], parityCount: number): boolean {
  for (let i = 0; i < parityCount; i++) {
    let s = 0;
    for (const b of block) s = gfMul(s, EXP[i]) ^ b;
    if (s !== 0) return false;
  }
  return true;
}
/** Decodes actual sampled pixels; does not compare against encoder modules. */
export async function decodeAlignedGrid(grid: boolean[][]): Promise<QrDecodeResult> {
  const n = grid.length, version = (n - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40 || grid.some(r => r.length !== n)) throw Error('QR ızgarası geçersiz.');
  let vertical = 0, horizontal = 0;
  for (let i = 0; i < 15; i++) {
    const y = i < 6 ? i : i < 8 ? i + 1 : n - 15 + i;
    const x = i < 8 ? n - i - 1 : i < 9 ? 15 - i : 14 - i;
    vertical |= Number(grid[y][8]) << i;
    horizontal |= Number(grid[8][x]) << i;
  }
  if (vertical !== horizontal) throw Error('Biçim bilgisi kopyaları uyuşmuyor.');
  let format = -1;
  for (let d = 0; d < 32; d++) if (bch(d, 0x537, 10, 0x5412) === vertical) { format = d; break; }
  if (format < 0) throw Error('Biçim bilgisinin hata kontrolü başarısız.');
  const level = format >> 3, mask = format & 7;
  const template = (await vendor()).LocalQRTools.functionGrid(version, level, mask);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (template[y][x] !== null && template[y][x] !== grid[y][x]) throw Error('QR yönlendirme veya sürüm alanı bozulmuş.');
  const bits: number[] = [];
  let up = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vert = 0; vert < n; vert++) {
      const y = up ? n - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (template[y][x] === null) bits.push(Number(grid[y][x] !== maskBit(mask, y, x)));
      }
    }
    up = !up;
  }
  const blocks = (await vendor()).LocalQRTools.rsBlocks(version, level), total = blocks.reduce((s, b) => s + b.totalCount, 0);
  if (bits.length < total * 8) throw Error('Veri alanı eksik.');
  if (bits.slice(total * 8).some(v => v !== 0)) throw Error('QR artık bitleri bozulmuş.');
  const words = Array.from({ length: total }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((v, b) => (v << 1) | b, 0));
  const separated: number[][] = blocks.map(b => new Array(b.totalCount).fill(0));
  let cursor = 0;
  for (let i = 0; i < Math.max(...blocks.map(b => b.dataCount)); i++) blocks.forEach((b, j) => { if (i < b.dataCount) separated[j][i] = words[cursor++]; });
  for (let i = 0; i < Math.max(...blocks.map(b => b.totalCount - b.dataCount)); i++) blocks.forEach((b, j) => { if (i < b.totalCount - b.dataCount) separated[j][b.dataCount + i] = words[cursor++]; });
  if (cursor !== total || blocks.some((b, j) => !verifyRsBlock(separated[j], b.totalCount - b.dataCount))) throw Error('Veri hata kontrolü başarısız.');
  const data = separated.flatMap((b, j) => b.slice(0, blocks[j].dataCount));
  let pos = 0;
  const read = (count: number): number => {
    if (pos + count > data.length * 8) throw Error('Eksik veri.');
    let v = 0;
    for (let i = 0; i < count; i++, pos++) v = v * 2 + ((data[pos >> 3] >> (7 - (pos & 7))) & 1);
    return v;
  };
  const output: number[] = [];
  let eci: number | null = null;
  while (pos + 4 <= data.length * 8) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 7) {
      eci = read(8);
      if (eci !== 26) throw Error('UTF-8 ECI bekleniyor.');
      continue;
    }
    if (mode !== 4) throw Error('Bu doğrulayıcı yalnız UTF-8 bayt modunu kabul eder.');
    const len = read(version < 10 ? 8 : 16);
    for (let i = 0; i < len; i++) output.push(read(8));
  }
  const bytes = Uint8Array.from(output);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { text, bytes, version, mask, correctionLevel: level, eci };
}
export interface QrPixels { width: number; height: number; data: Uint8ClampedArray }
export function sampleAlignedPixels(image: QrPixels, n: number, jitterX = 0, jitterY = 0): boolean[][] {
  const pitch = image.width / (n + 8);
  if (image.width !== image.height) throw Error('Çıktı kare değil.');
  const lum = (x: number, y: number): number => { const i = (y * image.width + x) * 4; return .2126 * image.data[i] + .7152 * image.data[i + 1] + .0722 * image.data[i + 2]; };
  // Conservative opaque-white margin check; do not crop away quiet-zone damage.
  const edge = Math.floor(4 * pitch) - 1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++)
    if (x < edge || y < edge || x >= image.width - edge || y >= image.height - edge) {
      const i = (y * image.width + x) * 4;
      if (lum(x, y) < 250 || image.data[i + 3] !== 255) throw Error('QR boş kenarı veya beyaz zemin değişmiş.');
    }
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => {
    const ix = Math.min(image.width - 1, Math.max(0, Math.floor((x + 4.5 + jitterX) * pitch)));
    const iy = Math.min(image.height - 1, Math.max(0, Math.floor((y + 4.5 + jitterY) * pitch)));
    return lum(ix, iy) < 150;
  }));
}
const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0));
function abortIf(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new DOMException('İşlem iptal edildi.', 'AbortError'); }
function loadSvgImage(svg: string, signal: AbortSignal | undefined): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), img = new Image();
    const finish = (): void => { clearTimeout(timer); URL.revokeObjectURL(url); signal?.removeEventListener('abort', cancel); };
    const cancel = (): void => { finish(); img.src = ''; reject(new DOMException('İşlem iptal edildi.', 'AbortError')); };
    const timer = setTimeout(() => { finish(); reject(Error('SVG görüntülenemedi; doğrulama zaman aşımı.')); }, 8000);
    img.onload = () => { finish(); resolve(img); };
    img.onerror = () => { finish(); reject(Error('SVG görüntülenemedi.')); };
    signal?.addEventListener('abort', cancel, { once: true });
    img.src = url;
  });
}
function canvasPng(c: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(Error('PNG oluşturulamadı.')), 'image/png')); }
export async function validateQrRaster(artifact: QrArtifact, signal?: AbortSignal): Promise<QrValidated> {
  const start = performance.now();
  abortIf(signal);
  const img = await loadSvgImage(artifact.svg, signal);
  abortIf(signal);
  const n = artifact.modules, reduced = (n + 8) * 6, tests: string[] = [];
  const full = document.createElement('canvas');
  full.width = full.height = artifact.size;
  const fc = full.getContext('2d', { willReadFrequently: true });
  if (!fc) throw Error('Canvas kullanılamıyor.');
  fc.drawImage(img, 0, 0, full.width, full.height);
  const configurations: [string, number, string][] = [['Nihai çıktı', artifact.size, 'none'], ['6 px/modül', reduced, 'none'], ['Hafif bulanıklık', reduced, 'blur(0.35px)']];
  const expected = new TextEncoder().encode(artifact.payload);
  for (const [name, size, filter] of configurations) {
    abortIf(signal);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw Error('Canvas kullanılamıyor.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.filter = filter;
    ctx.drawImage(full, 0, 0, size, size);
    ctx.filter = 'none';
    const pixels = ctx.getImageData(0, 0, size, size);
    for (const [jx, jy] of [[0, 0], [-.12, .12], [.12, -.12]]) {
      abortIf(signal);
      const result = await decodeAlignedGrid(sampleAlignedPixels(pixels, n, jx, jy));
      if (result.eci !== 26 || result.correctionLevel !== 2 || result.bytes.length !== expected.length || result.bytes.some((v, i) => v !== expected[i])) throw Error('QR içeriği girilen veriyle eşleşmedi.');
      tests.push(`${name} · örnekleme ${jx},${jy}`);
      await tick();
    }
  }
  abortIf(signal);
  const png = await canvasPng(full);
  abortIf(signal);
  // The PNG is made from the same raster whose actual pixels were verified.
  return { artifact, png, report: { revision: QR_CHECK_REVISION, svgPixels: artifact.size, reducedPixels: reduced, passed: tests.length, total: 9, tests, scope: 'Konumu bilinen QR ızgarasında bayt ve Reed–Solomon doğrulaması. Kamera algılama testi değildir.', timeMs: Math.round(performance.now() - start) } };
}
