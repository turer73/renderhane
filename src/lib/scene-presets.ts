export interface ScenePreset {
  id: string;
  labelTr: string;
  labelEn: string;
  prompt: string;
  icon: string;
}

/**
 * Pre-built scene/background presets for the Bria Product Shot API.
 *
 * Each preset contains:
 * - Bilingual labels (Turkish + English) for the UI
 * - An English `prompt` that maps directly to `scene_description`
 * - An emoji `icon` for quick visual recognition
 */
export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: "marble",
    labelTr: "Mermer Yüzey",
    labelEn: "Marble Surface",
    prompt:
      "professional product photography on a clean marble surface with soft natural lighting",
    icon: "💎",
  },
  {
    id: "wooden-table",
    labelTr: "Ahşap Masa",
    labelEn: "Wooden Table",
    prompt:
      "product photography on a warm wooden table surface with natural window light, cozy atmosphere",
    icon: "🪵",
  },
  {
    id: "minimalist-white",
    labelTr: "Minimalist Beyaz",
    labelEn: "Minimalist White",
    prompt:
      "clean minimalist product photo on pure white surface with soft diffused studio lighting, e-commerce style",
    icon: "⬜",
  },
  {
    id: "nature-outdoor",
    labelTr: "Doğa / Bahçe",
    labelEn: "Nature / Garden",
    prompt:
      "product photography in a lush green garden setting with natural sunlight filtering through leaves",
    icon: "🌿",
  },
  {
    id: "kitchen-counter",
    labelTr: "Mutfak Tezgahı",
    labelEn: "Kitchen Counter",
    prompt:
      "product photography on a modern kitchen counter with warm ambient lighting, lifestyle setting",
    icon: "🍳",
  },
  {
    id: "bathroom-shelf",
    labelTr: "Banyo Rafı",
    labelEn: "Bathroom Shelf",
    prompt:
      "product photography on an elegant bathroom shelf with soft spa-like lighting, clean tiles background",
    icon: "🛁",
  },
  {
    id: "luxury-fabric",
    labelTr: "Lüks Kumaş",
    labelEn: "Luxury Fabric",
    prompt:
      "premium product photography on luxurious silk or velvet fabric with dramatic studio lighting",
    icon: "✨",
  },
  {
    id: "gradient-studio",
    labelTr: "Gradient Stüdyo",
    labelEn: "Gradient Studio",
    prompt:
      "professional studio product photography with smooth gradient background, clean commercial lighting",
    icon: "🎨",
  },
  {
    id: "living-room",
    labelTr: "Yaşam Alanı",
    labelEn: "Living Room",
    prompt:
      "product photography in a stylish modern living room setting with natural daylight, lifestyle scene",
    icon: "🛋️",
  },
  {
    id: "concrete-industrial",
    labelTr: "Beton / Endüstriyel",
    labelEn: "Concrete / Industrial",
    prompt:
      "product photography on raw concrete surface with industrial loft atmosphere, moody directional lighting",
    icon: "🏗️",
  },
  {
    id: "beach-sand",
    labelTr: "Plaj / Kumsal",
    labelEn: "Beach / Sand",
    prompt:
      "product photography on sandy beach surface with golden hour sunlight, ocean waves in soft background",
    icon: "🏖️",
  },
  {
    id: "seasonal-festive",
    labelTr: "Sezon / Bayram",
    labelEn: "Seasonal / Festive",
    prompt:
      "festive product photography with holiday decorations, warm bokeh lights, cozy celebratory atmosphere",
    icon: "🎄",
  },
];
