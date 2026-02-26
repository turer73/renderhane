"use client";

import { Component, Suspense, useEffect, useMemo, type ReactNode, type ErrorInfo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Center,
  useGLTF,
  Html,
  useProgress,
} from "@react-three/drei";
import { useTranslations } from "next-intl";
import * as THREE from "three";

function Loader() {
  const { progress } = useProgress();
  const t = useTranslations("viewer");
  return (
    <Html center>
      <span className="text-sm">{t("loading")} {progress.toFixed(0)}%</span>
    </Html>
  );
}

function Model({ url }: { url: string }) {
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

class ViewerErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Viewer error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface ModelViewerProps {
  url: string;
  className?: string;
  autoRotate?: boolean;
}

export function ModelViewer({
  url,
  className = "h-[500px] w-full",
  autoRotate = true,
}: ModelViewerProps) {
  const t = useTranslations("viewer");

  const errorFallback = (
    <div
      className={`${className} flex items-center justify-center rounded-lg border bg-muted`}
    >
      <p className="text-sm text-muted-foreground">
        {t("loadError")}
      </p>
    </div>
  );

  return (
    <ViewerErrorBoundary fallback={errorFallback}>
      <div className={`${className} rounded-lg border bg-black/5`}>
        <Canvas camera={{ position: [0, 1, 3], fov: 50 }}>
          <Suspense fallback={<Loader />}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <Model url={url} />
            <OrbitControls
              autoRotate={autoRotate}
              autoRotateSpeed={2}
              enableZoom={true}
              enablePan={true}
              makeDefault
            />
            <Environment preset="studio" />
          </Suspense>
        </Canvas>
      </div>
    </ViewerErrorBoundary>
  );
}
