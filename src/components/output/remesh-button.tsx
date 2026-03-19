"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Wrench, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RemeshButtonProps {
  modelUrl: string;
}

export function RemeshButton({ modelUrl }: RemeshButtonProps) {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const [repairing, setRepairing] = useState(false);

  async function handleRepair() {
    setRepairing(true);
    toast.info(locale === "tr" ? "Model onarılıyor..." : "Repairing model...");

    try {
      // Dynamic import — only loads Three.js when repair is clicked
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { mergeVertices } = await import("three/addons/utils/BufferGeometryUtils.js");

      // 1. Load the GLB
      const loader = new GLTFLoader();
      const gltf = await new Promise<{ scene: InstanceType<typeof THREE.Group> }>((resolve, reject) => {
        loader.load(modelUrl, resolve, undefined, reject);
      });

      // 2. Repair each mesh in the scene
      let repaired = 0;
      gltf.scene.traverse((child: InstanceType<typeof THREE.Object3D>) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          const geo = child.geometry as InstanceType<typeof THREE.BufferGeometry>;

          // Merge duplicate vertices (fixes non-manifold edges)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const merged = mergeVertices(geo as any, 0.0001);

          // Recompute normals (fixes dark/inverted faces)
          merged.computeVertexNormals();

          // Remove degenerate triangles (zero-area faces)
          const index = merged.index;
          if (index) {
            const pos = merged.getAttribute("position");
            const validIndices: number[] = [];
            const v0 = new THREE.Vector3();
            const v1 = new THREE.Vector3();
            const v2 = new THREE.Vector3();

            for (let i = 0; i < index.count; i += 3) {
              const a = index.getX(i);
              const b = index.getX(i + 1);
              const c = index.getX(i + 2);

              v0.fromBufferAttribute(pos, a);
              v1.fromBufferAttribute(pos, b);
              v2.fromBufferAttribute(pos, c);

              // Skip degenerate triangles
              const area = new THREE.Triangle(v0, v1, v2).getArea();
              if (area > 0.00001) {
                validIndices.push(a, b, c);
              }
            }

            merged.setIndex(validIndices);
          }

          child.geometry = merged;
          repaired++;
        }
      });

      // 3. Export — GLB + STL
      const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
      const { STLExporter } = await import("three/addons/exporters/STLExporter.js");

      // Export GLB
      const glbExporter = new GLTFExporter();
      const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
        glbExporter.parse(
          gltf.scene,
          (result) => resolve(result as ArrayBuffer),
          reject,
          { binary: true }
        );
      });

      // Export STL
      const stlExporter = new STLExporter();
      const stlData = stlExporter.parse(gltf.scene, { binary: true });
      const stlBuffer = stlData instanceof DataView ? stlData.buffer : stlData;

      // 4. Download both files
      function downloadBlob(data: BlobPart, name: string, type: string) {
        const blob = new Blob([data], { type });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }

      downloadBlob(glb, "renderhane-repaired.glb", "model/gltf-binary");
      await new Promise((r) => setTimeout(r, 500));
      downloadBlob(stlBuffer, "renderhane-repaired.stl", "model/stl");

      toast.success(
        locale === "tr"
          ? `Model onarıldı! GLB + STL indiriliyor (${repaired} mesh düzeltildi)`
          : `Model repaired! Downloading GLB + STL (${repaired} meshes fixed)`
      );
    } catch (err) {
      console.error("Repair error:", err);
      toast.error(locale === "tr" ? "Onarım başarısız oldu" : "Repair failed");
    } finally {
      setRepairing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRepair}
      disabled={repairing}
      className="gap-1.5"
    >
      {repairing ? (
        <>
          <Wrench className="size-3.5 animate-spin" />
          {locale === "tr" ? "Onarılıyor..." : "Repairing..."}
        </>
      ) : (
        <>
          <Download className="size-3.5" />
          {locale === "tr" ? "Onarılmış GLB İndir" : "Download Repaired GLB"}
        </>
      )}
    </Button>
  );
}
