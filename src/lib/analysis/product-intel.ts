/**
 * Code-only product intelligence (no external LLM).
 *
 * Everything here is downstream of the Florence-2 caption (the one piece that
 * genuinely needs a vision model). Given the caption + extracted tags, these
 * pure functions classify the product and derive smart defaults — instant,
 * free, deterministic. Brittle on the long tail (unusual products) by design;
 * that's the trade vs. an LLM.
 */

export type ProductCategory =
  | "jewelry" | "cosmetics" | "apparel" | "footwear" | "bag"
  | "food" | "beverage" | "electronics" | "furniture" | "toy" | "generic";

/** First match wins — order matters where keywords overlap (e.g. "watch", "bottle"). */
const CATEGORY_KEYWORDS: Array<{ category: ProductCategory; kw: string[] }> = [
  { category: "jewelry", kw: ["ring", "necklace", "earring", "bracelet", "jewelry", "jewellery", "diamond", "pendant", "gemstone", "watch"] },
  { category: "footwear", kw: ["shoe", "sneaker", "boot", "heel", "sandal", "footwear", "trainer"] },
  { category: "bag", kw: ["handbag", "backpack", "purse", "luggage", "wallet", "tote", "bag"] },
  { category: "apparel", kw: ["shirt", "dress", "garment", "clothing", "apparel", "jacket", "pants", "skirt", "hoodie", "sweater", "coat", "fashion"] },
  { category: "cosmetics", kw: ["cosmetic", "makeup", "lipstick", "perfume", "fragrance", "serum", "skincare", "lotion", "cream", "nail polish"] },
  { category: "beverage", kw: ["drink", "beverage", "coffee", "tea", "juice", "wine", "soda", "can", "bottle"] },
  { category: "food", kw: ["food", "snack", "chocolate", "cookie", "fruit", "bread", "meal", "dish", "cake", "candy"] },
  { category: "electronics", kw: ["phone", "laptop", "headphone", "earbud", "camera", "speaker", "gadget", "electronic", "charger", "console", "device"] },
  { category: "furniture", kw: ["chair", "table", "sofa", "couch", "furniture", "lamp", "desk", "shelf"] },
  { category: "toy", kw: ["toy", "doll", "figure", "lego", "puzzle"] },
];

export function detectProductType(caption: string, tags: string[]): ProductCategory {
  const hay = (caption + " " + tags.join(" ")).toLowerCase();
  for (const { category, kw } of CATEGORY_KEYWORDS) {
    if (kw.some((k) => hay.includes(k))) return category;
  }
  return "generic";
}

export interface SmartDefaults {
  /** key in SCENE_PRESETS (src/lib/prompts/presets.ts) */
  sceneType: string;
  /** short Turkish rationale shown to the user */
  note: string;
  /** English rationale for /en */
  noteEn: string;
}

export const SMART_DEFAULTS: Record<ProductCategory, SmartDefaults> = {
  jewelry: { sceneType: "luxury", note: "Takı → lüks, koyu zemin", noteEn: "Jewelry → luxury, dark backdrop" },
  cosmetics: { sceneType: "minimal", note: "Kozmetik → minimal, temiz", noteEn: "Cosmetics → minimal, clean" },
  apparel: { sceneType: "lifestyle", note: "Giyim → yaşam tarzı", noteEn: "Apparel → lifestyle" },
  footwear: { sceneType: "studio", note: "Ayakkabı → stüdyo", noteEn: "Footwear → studio" },
  bag: { sceneType: "luxury", note: "Çanta → lüks sahne", noteEn: "Bag → luxury scene" },
  food: { sceneType: "lifestyle", note: "Gıda → sıcak yaşam tarzı", noteEn: "Food → warm lifestyle" },
  beverage: { sceneType: "studio", note: "İçecek → stüdyo", noteEn: "Beverage → studio" },
  electronics: { sceneType: "minimal", note: "Elektronik → minimal", noteEn: "Electronics → minimal" },
  furniture: { sceneType: "lifestyle", note: "Mobilya → yaşam tarzı", noteEn: "Furniture → lifestyle" },
  toy: { sceneType: "studio", note: "Oyuncak → stüdyo", noteEn: "Toy → studio" },
  generic: { sceneType: "studio", note: "Stüdyo (varsayılan)", noteEn: "Studio (default)" },
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  jewelry: "Takı", cosmetics: "Kozmetik", apparel: "Giyim", footwear: "Ayakkabı",
  bag: "Çanta", food: "Gıda", beverage: "İçecek", electronics: "Elektronik",
  furniture: "Mobilya", toy: "Oyuncak", generic: "Ürün",
};

export const CATEGORY_LABELS_EN: Record<ProductCategory, string> = {
  jewelry: "Jewelry", cosmetics: "Cosmetics", apparel: "Apparel", footwear: "Footwear",
  bag: "Bag", food: "Food", beverage: "Beverage", electronics: "Electronics",
  furniture: "Furniture", toy: "Toy", generic: "Product",
};

export function smartDefaultsFor(caption: string, tags: string[]): SmartDefaults & { category: ProductCategory; label: string; labelEn: string } {
  const category = detectProductType(caption, tags);
  return { category, label: CATEGORY_LABELS[category], labelEn: CATEGORY_LABELS_EN[category], ...SMART_DEFAULTS[category] };
}

/** UI navigation target for a suggested tool from the analyze route. */
export interface ToolTarget { group: string; tab: string; label: string; labelEn: string; }

export const TOOL_TARGETS: Record<string, ToolTarget> = {
  "scene": { group: "ecommerce", tab: "scene", label: "Sahne Üret", labelEn: "Generate Scene" },
  "virtual-tryon": { group: "ecommerce", tab: "virtual-tryon", label: "Kıyafet Giydir", labelEn: "Virtual Try-On" },
  "bg-remove": { group: "image", tab: "bg-remove", label: "Arkaplan Kaldır", labelEn: "Remove Background" },
  "enhance": { group: "image", tab: "enhance", label: "Görseli İyileştir", labelEn: "Enhance Image" },
  "talking-avatar": { group: "video", tab: "talking-avatar", label: "Konuşan Avatar", labelEn: "Talking Avatar" },
};

/** Pick the first suggested tool that maps to a known UI target. */
export function primaryToolTarget(suggestedTools: string[]): ToolTarget | null {
  for (const t of suggestedTools) {
    if (TOOL_TARGETS[t]) return TOOL_TARGETS[t];
  }
  return null;
}
