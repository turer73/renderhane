export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Preload hero 3D model so it starts downloading before JS hydrates */}
      <link
        rel="preload"
        href="/hero/renderhane.glb"
        as="fetch"
        crossOrigin="anonymous"
      />
      {children}
    </>
  );
}
