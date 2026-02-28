"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/* ── Rotating model (no controls — auto-rotate via useFrame) ── */
function RotatingModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  // Cleanup geometry/material on unmount
  useEffect(() => {
    return () => {
      cloned.traverse((obj: THREE.Object3D) => {
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
  }, [cloned]);

  return (
    <group ref={groupRef}>
      <Center>
        <primitive object={cloned} />
      </Center>
    </group>
  );
}

/* ── Error boundary — fallback to null on broken models ── */
class ThumbnailErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/* ── Main thumbnail component ── */
interface ModelThumbnailProps {
  url: string;
}

export function ModelThumbnail({ url }: ModelThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // IntersectionObserver — only mount Canvas when visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Once visible, stay mounted
        }
      },
      { rootMargin: "200px" } // Pre-load 200px before viewport
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      {isVisible && (
        <ThumbnailErrorBoundary>
          <Canvas
            camera={{ position: [0, 0.5, 2], fov: 50 }}
            gl={{
              antialias: false,
              powerPreference: "low-power",
            }}
            dpr={1}
            style={{ background: "transparent" }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[3, 4, 5]} intensity={0.8} />
            <Suspense fallback={null}>
              <RotatingModel url={url} />
            </Suspense>
          </Canvas>
        </ThumbnailErrorBoundary>
      )}
    </div>
  );
}
