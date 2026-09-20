import {describe, expect, it} from 'vitest';
import {COMPOSER_FORMATS, fallbackComposerLoginPath, fitRect, localizeComposerText, normalizePlacement, validateCompositionFile} from '../composer';

describe('composer', () => {
  it('localizes every runtime image error', () => {
    expect(localizeComposerText('En fazla 24 megapiksel görsel kullan.', 'en')).toBe('Use an image up to 24 megapixels.');
    expect(localizeComposerText('Görsel tamamen saydam; yerleştirilecek ürün yok.', 'en')).toBe('The image is fully transparent; there is no product to place.');
    expect(localizeComposerText('Görsel yükleme süresi doldu.', 'en')).toBe('Image loading timed out.');
  });

  it('keeps the fallback login path relative and locale-aware', () => {
    expect(fallbackComposerLoginPath()).toBe('/tr/login');
    expect(fallbackComposerLoginPath('en')).toBe('/en/login');
  });

  it('format boyutlari demoyla esit', () => {
    expect(COMPOSER_FORMATS).toEqual({square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080]});
  });
  it('yerlesim sinirlara kelepcelenir', () => {
    expect(normalizePlacement({x: 9, y: -2, scale: 99, rotation: 400})).toEqual({x: 1, y: 0, scale: 1.65, rotation: 180});
    expect(normalizePlacement({x: NaN, y: 0.5, scale: 0.5, rotation: 0}).x).toBe(0.5);
  });
  it('fitRect cover/contain hesaplar', () => {
    expect(fitRect(100, 50, 200, 200, 'cover')).toEqual({x: -100, y: 0, width: 400, height: 200});
    expect(fitRect(100, 50, 200, 200, 'contain')).toEqual({x: 0, y: 50, width: 200, height: 100});
    expect(() => fitRect(0, 50, 200, 200, 'cover')).toThrow();
  });
  it('dosya turu ve boyutu dogrulanir', () => {
    expect(() => validateCompositionFile(new File(['x'], 'a.svg', {type: 'image/svg+xml'}))).toThrow();
    expect(() => validateCompositionFile(new File(['x'], 'a.png', {type: 'image/png'}))).not.toThrow();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'b.png', {type: 'image/png'});
    expect(() => validateCompositionFile(big)).toThrow();
  });
});
