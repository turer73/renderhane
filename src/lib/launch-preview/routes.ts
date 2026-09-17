/** Preview-only routes. Production endpoints and auth callbacks are not mutated. */
import type {Locale} from './core';
export const PREVIEW_TOOL_SLUGS = {
  background:'arka-plan-kaldirma', qr:'qr-kod', nfc:'nfc-yaz',
  artistic:'sanatsal-qr', scenes:'sahne-olustur', tools:'tum-araclar',
} as const;
export type PreviewTool = keyof typeof PREVIEW_TOOL_SLUGS;
export function previewHome(locale:Locale):string { return `/${locale}/launch-preview`; }
export function previewPath(locale:Locale,page:PreviewTool|'home'):string {
 return page==='home'?previewHome(locale):`${previewHome(locale)}/araclar/${PREVIEW_TOOL_SLUGS[page]}`;
}
export function toolFromSlug(slug:string):PreviewTool|null {
 return (Object.entries(PREVIEW_TOOL_SLUGS).find(([,v])=>v===slug)?.[0] as PreviewTool|undefined)??null;
}
