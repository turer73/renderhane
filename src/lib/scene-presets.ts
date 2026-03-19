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
  /* ── Yüzey / Malzeme ── */
  {
    id: "marble",
    labelTr: "Mermer Yüzey",
    labelEn: "Marble Surface",
    prompt:
      "premium product photography on polished white marble surface, soft directional light from left, subtle reflections, clean editorial style, high-end catalog quality",
    icon: "💎",
  },
  {
    id: "wooden-table",
    labelTr: "Ahşap Masa",
    labelEn: "Wooden Table",
    prompt:
      "product photography on warm oak wood table, natural window light streaming in from the side, a small green plant in soft background, cozy artisan cafe atmosphere",
    icon: "🪵",
  },
  {
    id: "luxury-fabric",
    labelTr: "Lüks Kumaş",
    labelEn: "Luxury Fabric",
    prompt:
      "premium product photography on draped ivory silk fabric, dramatic side lighting with deep shadows, luxurious texture detail, high-fashion editorial feel",
    icon: "✨",
  },
  {
    id: "concrete-industrial",
    labelTr: "Beton / Endüstriyel",
    labelEn: "Concrete / Industrial",
    prompt:
      "product photography on raw concrete surface, industrial loft with exposed brick wall in background, moody directional lighting, urban minimalist aesthetic",
    icon: "🏗️",
  },

  /* ── Stüdyo ── */
  {
    id: "minimalist-white",
    labelTr: "Minimalist Beyaz",
    labelEn: "Minimalist White",
    prompt:
      "clean minimalist product photo on pure white infinity curve surface, perfectly diffused soft studio lighting, no shadows, Amazon/e-commerce product listing style",
    icon: "⬜",
  },
  {
    id: "gradient-studio",
    labelTr: "Gradient Stüdyo",
    labelEn: "Gradient Studio",
    prompt:
      "professional studio product photography with smooth blue-to-white gradient background, three-point lighting setup, crisp commercial advertisement quality",
    icon: "🎨",
  },
  {
    id: "dark-moody",
    labelTr: "Koyu / Dramatik",
    labelEn: "Dark / Dramatic",
    prompt:
      "dramatic product photography on dark matte black surface, single spotlight from above creating strong contrast, luxury brand advertisement mood, deep shadows",
    icon: "🖤",
  },

  /* ── Yaşam Alanları ── */
  {
    id: "living-room",
    labelTr: "Yaşam Alanı",
    labelEn: "Living Room",
    prompt:
      "lifestyle product photography in a stylish modern living room, neutral-toned sofa and coffee table, golden afternoon light through sheer curtains, warm inviting atmosphere",
    icon: "🛋️",
  },
  {
    id: "kitchen-counter",
    labelTr: "Mutfak Tezgahı",
    labelEn: "Kitchen Counter",
    prompt:
      "product photography on sleek modern kitchen counter, stainless steel appliances softly blurred behind, warm pendant lighting overhead, lifestyle cooking scene",
    icon: "🍳",
  },
  {
    id: "bathroom-shelf",
    labelTr: "Banyo Rafı",
    labelEn: "Bathroom Shelf",
    prompt:
      "product photography on elegant white bathroom shelf, eucalyptus branch and rolled towels nearby, soft diffused spa lighting, fresh clean wellness atmosphere",
    icon: "🛁",
  },
  {
    id: "office-desk",
    labelTr: "Ofis Masası",
    labelEn: "Office Desk",
    prompt:
      "product photography on a clean modern office desk, laptop and notebook slightly blurred in background, warm desk lamp lighting, productive professional workspace",
    icon: "💼",
  },

  /* ── Doğa / Dış Mekan ── */
  {
    id: "nature-outdoor",
    labelTr: "Doğa / Bahçe",
    labelEn: "Nature / Garden",
    prompt:
      "product photography surrounded by lush green foliage and wildflowers, dappled natural sunlight filtering through leaves, organic earthy botanical garden setting",
    icon: "🌿",
  },
  {
    id: "beach-sand",
    labelTr: "Plaj / Kumsal",
    labelEn: "Beach / Sand",
    prompt:
      "product photography on fine golden sand with gentle turquoise ocean waves in soft background, warm golden hour sunset lighting, summer vacation mood",
    icon: "🏖️",
  },
  {
    id: "rooftop-city",
    labelTr: "Teras / Şehir",
    labelEn: "Rooftop / City",
    prompt:
      "product photography on a modern rooftop terrace, blurred city skyline at twilight in background, warm string lights, sophisticated urban lifestyle scene",
    icon: "🌆",
  },

  /* ── Sezonluk ── */
  {
    id: "seasonal-festive",
    labelTr: "Sezon / Bayram",
    labelEn: "Seasonal / Festive",
    prompt:
      "festive product photography with elegant holiday decorations, warm golden bokeh lights in background, pine branches and gift boxes, cozy celebratory winter atmosphere",
    icon: "🎄",
  },
  {
    id: "spring-floral",
    labelTr: "İlkbahar / Çiçek",
    labelEn: "Spring / Floral",
    prompt:
      "fresh spring product photography with pastel flowers scattered around, soft pink and white petals, bright airy natural light, romantic springtime garden feeling",
    icon: "🌸",
  },
];
