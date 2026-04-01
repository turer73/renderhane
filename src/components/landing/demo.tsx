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
      className="relative scroll-mt-20 py-12 sm:py-28 bg-gradient-to-b from-slate-50/50 to-background dark:from-slate-900/30 dark:to-background"
    >
      {/* Radial gradient glow — indigo tint */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_oklch(0.55_0.2_275_/_0.06)_0%,transparent_60%)]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Single dark frame wrapping everything */}
        <div className="mx-auto max-w-4xl">
          <div className="relative">
            {/* Gradient glow border */}
            <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 opacity-75" />
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 opacity-20 blur-xl" />

            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#1e1b4b] via-[#1e1b4b] to-[#0f0a2e] px-4 py-8 shadow-2xl shadow-indigo-500/30 sm:rounded-3xl sm:px-10 sm:py-14">
              {/* Header */}
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                  {t("demo.title")}
                </h2>
                <p className="mt-2 text-base text-indigo-200/70 sm:mt-4 sm:text-lg">
                  {t("demo.subtitle")}
                </p>
              </div>

              {/* Before/After visual */}
              <div className="mx-auto mt-8 max-w-3xl sm:mt-12">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                  {/* Before — Original photo */}
                  <div className="overflow-hidden rounded-2xl border border-indigo-400/20 bg-white/5">
                    <div className="border-b border-indigo-400/20 px-4 py-2.5">
                      <span className="text-sm font-medium text-indigo-200/70">
                        {t("demo.before")}
                      </span>
                    </div>
                    <div className="relative aspect-[4/3] bg-white/5 sm:aspect-square">
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
                  <div className="overflow-hidden rounded-2xl border border-indigo-400/30 bg-white/5">
                    <div className="flex items-center justify-between border-b border-indigo-400/20 bg-indigo-500/10 px-4 py-2.5">
                      <span className="text-sm font-medium text-indigo-200">
                        {t("demo.after")}
                      </span>
                      <span className="text-[10px] text-indigo-300/50">
                        {t("demo.interact")}
                      </span>
                    </div>
                    <div className="relative aspect-[4/3] sm:aspect-square">
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
                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#1e1b4b]/60 to-transparent" />
                    </div>
                  </div>
                </div>

                {/* Arrow between cards on mobile */}
                <div className="my-4 flex justify-center sm:hidden">
                  <ArrowRight className="size-6 rotate-90 text-indigo-300/50" />
                </div>
              </div>

              {/* Divider */}
              <div className="mx-auto mt-10 max-w-xs border-t border-indigo-400/15" />

              {/* Steps */}
              <div className="mx-auto mt-8 grid max-w-3xl grid-cols-3 gap-3 sm:mt-10 sm:gap-6">
                {steps.map((step) => (
                  <div key={step.num} className="group flex flex-col items-center text-center">
                    <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:bg-indigo-500/25 group-hover:shadow-md group-hover:shadow-indigo-500/20 sm:mb-3 sm:size-12">
                      <step.icon className="size-4 sm:size-5" />
                    </div>
                    <div className="mb-0.5 text-xs font-bold text-indigo-300 sm:mb-1 sm:text-sm">
                      {step.num}
                    </div>
                    <p className="text-[11px] text-indigo-200/60 sm:text-sm">{step.text}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-10 text-center">
                <Button
                  size="lg"
                  asChild
                  className="group h-12 px-8 text-base bg-indigo-500 text-white shadow-xl shadow-indigo-500/30 hover:bg-indigo-400 hover:shadow-indigo-400/40 hover:shadow-2xl transition-all duration-300"
                >
                  <Link href={`/${locale}/login`}>
                    {t("demo.tryNow")}
                    <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
