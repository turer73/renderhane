"use client";

import { Suspense, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Center,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Upload, Wand2, Download, ArrowRight, RotateCcw } from "lucide-react";

/* ── Lightweight 3D model for landing demo ── */
function DemoModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    return () => {
      clonedScene.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else if (mat) {
            (mat as THREE.Material).dispose();
          }
        }
      });
    };
  }, [clonedScene]);

  return (
    <Center>
      <primitive object={clonedScene} />
    </Center>
  );
}

function MiniLoader() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <RotateCcw className="size-6 animate-spin text-indigo-500/60" />
      <span className="text-xs text-muted-foreground">3D Model</span>
    </div>
  );
}

/* ── Main section ── */
export function DemoSection() {
  const t = useTranslations("landing");
  const params = useParams();
  const locale = params.locale as string;

  const steps = [
    { icon: Upload, text: t("demo.step1"), num: "1" },
    { icon: Wand2, text: t("demo.step2"), num: "2" },
    { icon: Download, text: t("demo.step3"), num: "3" },
  ];

  return (
    <section
      id="demo"
      className="relative scroll-mt-20 py-20 sm:py-28"
    >
      {/* Subtle radial gradient — indigo tint */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_oklch(0.55_0.2_275_/_0.04)_0%,transparent_70%)]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("demo.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("demo.subtitle")}
          </p>
        </div>

        {/* Before/After visual */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Before — Original photo */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("demo.before")}
                </span>
              </div>
              <div className="relative aspect-square bg-muted/30">
                <Image
                  src="/demo/original.png"
                  alt="Original product photo"
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
            </div>

            {/* After — Interactive 3D Model */}
            <div className="overflow-hidden rounded-2xl border border-indigo-300/50 bg-card shadow-lg shadow-indigo-100/30 dark:border-indigo-500/30 dark:shadow-indigo-900/10">
              <div className="flex items-center justify-between border-b border-indigo-200/50 bg-indigo-50/50 px-4 py-2.5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  {t("demo.after")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {t("demo.interact")}
                </span>
              </div>
              <div className="relative aspect-square bg-muted/20">
                <Suspense fallback={<MiniLoader />}>
                  <Canvas
                    camera={{ position: [0, 0.6, 1.8], fov: 40 }}
                    className="!absolute inset-0"
                    gl={{ antialias: true, alpha: true }}
                    dpr={[1, 1.5]}
                  >
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[5, 5, 5]} intensity={1} />
                    <DemoModel url="/demo/renderhane.glb" />
                    <OrbitControls
                      autoRotate
                      autoRotateSpeed={3}
                      enableZoom={false}
                      enablePan={false}
                      minPolarAngle={Math.PI / 4}
                      maxPolarAngle={Math.PI / 1.8}
                      makeDefault
                    />
                    <Environment preset="studio" />
                  </Canvas>
                </Suspense>

                {/* Gradient overlay bottom */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card/60 to-transparent" />
              </div>
            </div>
          </div>

          {/* Arrow between cards on mobile */}
          <div className="my-4 flex justify-center sm:hidden">
            <ArrowRight className="size-6 rotate-90 text-muted-foreground" />
          </div>
        </div>

        {/* Steps */}
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <step.icon className="size-5" />
              </div>
              <div className="mb-1 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {step.num}
              </div>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Button
            size="lg"
            asChild
            className="h-12 px-8 text-base bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300/50 dark:shadow-indigo-900/30 transition-all"
          >
            <Link href={`/${locale}/login`}>
              {t("demo.tryNow")}
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
