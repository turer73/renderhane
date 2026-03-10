"use client";

import dynamic from "next/dynamic";

const DemoSection = dynamic(
  () => import("@/components/landing/demo").then((m) => m.DemoSection),
  { ssr: false }
);

export function DemoSectionLazy() {
  return <DemoSection />;
}
