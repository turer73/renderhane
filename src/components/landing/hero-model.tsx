"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, useGLTF, Environment } from "@react-three/drei";
import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";

/* ── Floating rotating model — no controls, pure auto-rotate ── */
function FloatingModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, undefined, undefined, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    // Apply dark tint — multiply original colors by a darker tone
    const tint = new THREE.Color(0.55, 0.55, 0.6);
    c.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((mat) => {
        if ("color" in mat && mat.color instanceof THREE.Color) {
          mat.color.multiply(tint);
        }
      });
    });
    return c;
  }, [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Smooth Y rotation
    groupRef.current.rotation.y += delta * 0.4;
    // Gentle floating bob (up/down)
    timeRef.current += delta;
    groupRef.current.position.y = Math.sin(timeRef.current * 1.2) * 0.03;
  });

  // Cleanup on unmount
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

/* ── Error boundary — graceful fallback ── */
class HeroModelErrorBoundary extends Component<
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

/* ── Exported hero 3D component ── */
export function HeroModel() {
  return (
    <div className="mx-auto h-48 w-48 sm:h-56 sm:w-56 lg:h-64 lg:w-64">
      <HeroModelErrorBoundary>
        <Canvas
          camera={{ position: [0, 0.5, 2.2], fov: 36 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.35} />
          <directionalLight position={[5, 5, 5]} intensity={0.5} />
          <directionalLight position={[-3, 2, -2]} intensity={0.15} />
          <Suspense fallback={null}>
            <FloatingModel url="/hero/renderhane.glb" />
            <Environment preset="studio" />
          </Suspense>
        </Canvas>
      </HeroModelErrorBoundary>
    </div>
  );
}
