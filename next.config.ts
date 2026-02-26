import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig = {
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
    ],
  },
};

export default withNextIntl(nextConfig);
