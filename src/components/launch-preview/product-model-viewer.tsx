'use client';

import { Suspense, useEffect, useMemo, useState, useCallback, Component, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function RoomLight() {
  const {gl, scene} = useThree();
  useEffect(() => {
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(room);
    const previous = scene.environment;
    // Three.js scene environment assignment is the documented pattern;
    // the immutability rule targets React state, not the WebGL scene graph.
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = target.texture;
    room.dispose(); generator.dispose();
    return () => { scene.environment = previous; target.dispose(); };
  }, [gl, scene]);
  return null;
}
function CachedModel({onReady}:{onReady:()=>void}) {
  const {scene} = useGLTF('/demo/renderhane.glb');
  const cloned = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => { onReady(); }, [onReady]);
  // clone(true) still shares geometry/material with useGLTF's cache.
  // This instance does not own them: never dispose cached resources here.
  return <primitive object={cloned} dispose={null} />;
}
class ModelBoundary extends Component<{children:ReactNode; label:string}, {failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() { return this.state.failed ? <div className="rhl-loading" role="alert">{this.props.label}</div> : this.props.children; }
}
export default function ProductModelViewer({locale, rotating, resetKey}: {locale:'tr'|'en';rotating:boolean;resetKey:number}) {
  const [reduced, setReduced] = useState(true);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    change(); media.addEventListener('change',change);
    return () => media.removeEventListener('change',change);
  }, []);
  const error = locale === 'tr' ? 'Model açılamadı. Önizlemeyi kapatıp tekrar deneyin.' : 'Model could not load. Close the preview and retry.';
  return <ModelBoundary label={error}>
    <div className="rhl-viewer-area" aria-label={locale === 'tr' ? 'Sürükleyerek 3D modeli inceleyin' : 'Drag to inspect the 3D model'}>
      <Canvas key={resetKey} dpr={[1,1.5]} camera={{position:[1.8,.9,2.4], fov:40}} gl={{antialias:true, alpha:true}}
        fallback={<div className="rhl-loading">{locale === 'tr' ? 'Bu cihaz WebGL desteklemiyor.' : 'This device does not support WebGL.'}</div>}>
        <ambientLight intensity={0.25}/>
        <RoomLight/>
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.28}><CachedModel onReady={onReady}/></Bounds>
        </Suspense>
        <OrbitControls makeDefault autoRotate={rotating && !reduced} autoRotateSpeed={1.15} enablePan={false} enableZoom={false}/>
      </Canvas>
      {!ready && <div className="rhl-loading" role="status">{locale === 'tr' ? '3D dosyası yükleniyor…' : 'Loading 3D file…'}</div>}
    </div>
  </ModelBoundary>;
}
