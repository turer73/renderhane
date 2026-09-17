import {describe, expect, it} from 'vitest';
import {
  getInspirationIdea, getInspirationIdeas, ideaEscape, INSPIRATION_IDEAS,
  renderInspiration, validateIdeaUrl,
} from '../inspiration';

describe('inspiration', () => {
  it('qr ve nfc kanallarinda fikir dondurur, siraya dizer', () => {
    const qr = getInspirationIdeas('qr');
    const nfc = getInspirationIdeas('nfc');
    expect(qr.length).toBeGreaterThan(0);
    expect(nfc.length).toBeGreaterThan(0);
    expect(qr.every(i => i.channels.includes('qr'))).toBe(true);
    const ranks = qr.map(i => i.rankQr);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
  it('bilinmeyen kategori ve id bos doner', () => {
    expect(getInspirationIdeas('qr', 'yok')).toEqual([]);
    expect(getInspirationIdea('qr', 'yok')).toBeUndefined();
  });
  it('kart id kanala ozeldir', () => {
    const onlyNfc = INSPIRATION_IDEAS.find(i => i.channels.length === 1 && i.channels[0] === 'nfc');
    if (onlyNfc) expect(getInspirationIdea('qr', onlyNfc.id)).toBeUndefined();
  });
  it('escape html enjekte etmez', () => {
    expect(ideaEscape('<img src=x onerror=1>')).toBe('&lt;img src=x onerror=1&gt;');
  });
  it('validateIdeaUrl yalniz https kabul eder', () => {
    expect(validateIdeaUrl('https://ornek.com/sayfa')).toBe('https://ornek.com/sayfa');
    expect(() => validateIdeaUrl('http://ornek.com')).toThrow();
    expect(() => validateIdeaUrl('')).toThrow();
    expect(() => validateIdeaUrl('https://user:pass@ornek.com')).toThrow();
  });
  it('render 6 kart + filtre + reality icerir', () => {
    const html = renderInspiration('qr', {category: 'all', expanded: false, selected: null});
    expect(html).toContain('id="rh-inspiration"');
    expect(html.match(/class="rh-idea-card"/g)?.length).toBe(6);
    expect(html).toContain('data-idea-filter="all"');
    expect(html).toContain('rh-idea-reality');
  });
});
