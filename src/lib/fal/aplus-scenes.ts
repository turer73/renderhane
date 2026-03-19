export interface AplusScene {
  id: string;
  icon: string;
  prompt: { tr: string; en: string };
}

export const APLUS_SCENES: AplusScene[] = [
  {
    id: "studio",
    icon: "📸",
    prompt: {
      tr: "Profesyonel stüdyo, temiz beyaz yüzey, yumuşak gölge, editorial aydınlatma",
      en: "Professional studio, clean white surface, soft shadow, editorial lighting",
    },
  },
  {
    id: "lifestyle",
    icon: "🏠",
    prompt: {
      tr: "Yaşam tarzı sahnesi, zarif aksesuarlar, sıcak doğal ışık, şık iç mekan",
      en: "Lifestyle scene with elegant props, warm natural light, cozy interior",
    },
  },
  {
    id: "outdoor",
    icon: "🌿",
    prompt: {
      tr: "Doğal dış mekan, ahşap yüzey, bitkiler, altın saat ışığı",
      en: "Outdoor natural setting, wooden surface, plants, golden hour light",
    },
  },
  {
    id: "minimal",
    icon: "🖤",
    prompt: {
      tr: "Minimal koyu arka plan, dramatik spot ışık, lüks ürün fotoğrafçılığı",
      en: "Minimal dark background, dramatic spotlight, luxury product photography",
    },
  },
];

export function getScenePrompt(
  sceneId: string,
  locale: string = "tr"
): string {
  const scene = APLUS_SCENES.find((s) => s.id === sceneId);
  if (!scene) return APLUS_SCENES[0].prompt[locale === "en" ? "en" : "tr"];
  return scene.prompt[locale === "en" ? "en" : "tr"];
}

export const APLUS_SCENE_COUNT = APLUS_SCENES.length;
export const APLUS_TOTAL_CREDITS = 8 * APLUS_SCENE_COUNT; // 32
