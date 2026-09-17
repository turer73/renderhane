import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LaunchPreview } from '@/components/launch-preview/launch-preview';
export const metadata: Metadata = {
  title: 'Renderhane — 3D odaklı ana sayfa önizlemesi',
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  // Not an access-control boundary. Disabled by default outside a local review.
  if (process.env.RENDERHANE_LAUNCH_PREVIEW !== '1') notFound();
  const { locale } = await params;
  if (locale !== 'tr' && locale !== 'en') notFound();
  return <LaunchPreview locale={locale}/>;
}
