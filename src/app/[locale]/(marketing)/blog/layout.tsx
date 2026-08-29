import { AdSenseScript } from "@/components/ads/adsense-script";

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdSenseScript />
      {children}
    </>
  );
}
