import { AdSenseScript } from "@/components/ads/adsense-script";

export default function ToolsLayout({
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
