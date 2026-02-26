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
      <RotateCcw className="size-6 animate-spin text-primary/60" />
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
      className="scroll-mt-20 bg-muted/30 py-20 sm:py-28"
    >
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
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <div className="border-b border-border/50 px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("demo.before")}
                </span>
              </div>
              <div className="relative aspect-square bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800">
                <Image
                  src="/demo/renderhane.png"
                  alt="Original product photo"
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
            </div>

            {/* After — Interactive 3D Model */}
            <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-lg shadow-primary/5">
              <div className="flex items-center justify-between border-b border-primary/20 bg-primary/[0.03] px-4 py-2.5">
                <span className="text-sm font-medium text-primary">
                  {t("demo.after")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {t("demo.interact")}
                </span>
              </div>
              <div className="relative aspect-square bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-800">
                <Suspense fallback={<MiniLoader />}>
                  <Canvas
                    camera={{ position: [0, 1, 3], fov: 45 }}
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

                {/* Gradient overlay bottom for polish */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white/60 to-transparent dark:from-zinc-900/60" />
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
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon className="size-5" />
              </div>
              <div className="mb-1 text-sm font-bold text-primary">
                {step.num}
              </div>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Button size="lg" asChild className="h-12 px-8 text-base">
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
