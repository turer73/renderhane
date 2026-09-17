/** Pure preview helpers. No network, payments, credits mutation or storage. */
export const LAUNCH_TOOLS = [
  'img-to-3d', 'text-to-3d', 'texture', 'bg-remove', 'enhance',
  'text-to-image', 'image-edit', 'object-removal', 'inpainting',
  'image-to-video', 'text-to-video', 'scene', 'aplus', 'virtual-tryon',
  'talking-avatar', 'srt-voiceover', 'logo', 'qr-code',
] as const;
export type LaunchTool = (typeof LAUNCH_TOOLS)[number];
export type Locale = 'tr' | 'en';
const tools = new Set<string>(LAUNCH_TOOLS);
export function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'tr';
}
/** Only a single allowlisted tool ID is accepted. Never accept a return URL. */
export function parseLaunchTool(value: unknown): LaunchTool | null {
  return typeof value === 'string' && tools.has(value) ? value as LaunchTool : null;
}
export function workspacePath(locale: unknown, tool: unknown): string {
  const selected = parseLaunchTool(tool);
  return `/${normalizeLocale(locale)}/app${selected ? `?tool=${encodeURIComponent(selected)}` : ''}`;
}
export function loginPath(locale: unknown, tool: unknown): string {
  const selected = parseLaunchTool(tool);
  return `/${normalizeLocale(locale)}/login${selected ? `?tool=${encodeURIComponent(selected)}` : ''}`;
}
export function callbackPath(locale: unknown, tool: unknown): string {
  const selected = parseLaunchTool(tool);
  return `/${normalizeLocale(locale)}/auth/callback${selected ? `?tool=${encodeURIComponent(selected)}` : ''}`;
}
export interface ModelQuoteConfig {
  displayName: { tr: string; en: string };
  creditCost: number;
  imageParamKey: string;
  adminOnly?: boolean;
}
export interface ModelOption { key: string; label: string; credits: number }
/** Uses the host app registry. Excludes trials, text-only and invalid records. */
export function photoModelOptions(
  registry: Record<string, ModelQuoteConfig>,
  modelKeys: readonly string[],
  locale: unknown,
): ModelOption[] {
  return [...new Set(modelKeys)].flatMap((key) => {
    const m = registry[key];
    if (!m || m.adminOnly || !m.imageParamKey || m.imageParamKey === '_unused'
      || !Number.isSafeInteger(m.creditCost) || m.creditCost <= 0) return [];
    return [{ key, label: m.displayName[normalizeLocale(locale)], credits: m.creditCost }];
  });
}
/** Credit estimate only; does NOT claim a successful usable output or charge. */
export function quoteCredits(cost: number, count: number): number {
  if (!Number.isSafeInteger(cost) || cost <= 0) throw new RangeError('Invalid credit cost');
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new RangeError('Count must be 1–100');
  const total = cost * count;
  if (!Number.isSafeInteger(total)) throw new RangeError('Quote overflow');
  return total;
}
export interface CreditPackage { id: string; credits: number }
/** Smallest single sufficient package, not a cheapest-price recommendation. */
export function singleSufficientPackage(
  required: number, packages: readonly CreditPackage[],
): { kind: 'none' } | { kind: 'single'; packageId: string } | { kind: 'exceeds-single' } {
  if (!Number.isSafeInteger(required) || required < 0) throw new RangeError('Invalid requirement');
  if (!required) return {kind: 'none'};
  const eligible = packages.filter(p => Number.isSafeInteger(p.credits) && p.credits > 0)
    .slice().sort((a,b) => a.credits - b.credits);
  const found = eligible.find(p => p.credits >= required);
  return found ? {kind:'single',packageId:found.id} : {kind:'exceeds-single'};
}
