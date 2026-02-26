"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Center,
  useGLTF,
  Html,
  useProgress,
} from "@react-three/drei";

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <span className="text-sm">{progress.toFixed(0)}%</span>
    </Html>
  );
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return (
    <Center>
      <primitive object={scene} />
    </Center>
  );
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
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-lg border bg-muted`}
      >
        <p className="text-sm text-muted-foreground">
          Failed to load 3D model
        </p>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-lg border bg-black/5`}>
      <Canvas
        camera={{ position: [0, 1, 3], fov: 50 }}
        onError={() => setError(true)}
      >
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
  );
}
