import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  // NEXT_LOCALE'a Secure flag ekle. HttpOnly olamaz — dil değiştirici JS'den
  // okur. Localhost http dev'de cookie'yi düşürmemek için sadece prod'da.
  localeCookie: {
    secure: process.env.NODE_ENV === "production",
  },
});
