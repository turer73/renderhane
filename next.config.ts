import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["three"],
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "**.fal.media",
      },
      {
        protocol: "https" as const,
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https" as const,
        hostname: "*.r2.dev",
      },
      {
        protocol: "https" as const,
        hostname: "assets.renderhane.com",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
