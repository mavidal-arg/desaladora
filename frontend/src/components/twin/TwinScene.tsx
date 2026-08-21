"use client";

// TwinScene — the actual react-three-fiber scene. Loaded ONLY via next/dynamic
// (ssr:false) from SceneCanvas; never import it directly into a server component.
//
// Responsibilities:
//   • load the GLB (Draco decoder wired),
//   • orbit/zoom (OrbitControls) + auto-frame (Bounds),
//   • auto-discover `anchor:<code>:<signal>` empty nodes and float a live label
//     at each one (DataAnchor), bound to the `signals` map,
//   • render the RO area with a photoreal look — synthetic image-based lighting
//     (Lightformers, no external HDRI ⇒ works offline / behind the Tier0 CSP),
//     soft shadows + contact shadows, ACES tone mapping and a sandy ground —
//     so it reads like the IOM render instead of flat schematic boxes.
//
// Validated against: three ^0.185, @react-three/fiber ^9, @react-three/drei ^10,
// React 19, Next 16.

import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Bounds,
  Environment,
  Lightformer,
  ContactShadows,
  Html,
  useGLTF,
} from "@react-three/drei";
import { DataAnchor } from "./DataAnchor";
import type { SignalMap, SceneConfig } from "@/lib/useSceneSignals";

type AnchorHit = { assetCode: string; signal: string; pos: [number, number, number] };

// Subtle tileable sand texture generated on the client (canvas) — no external
// asset, so it survives the offline/CSP sandbox. Gives the ground grain +
// large-scale mottling instead of a dead flat colour.
function useSandTexture(): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const S = 256;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#c2a878";
    ctx.fillRect(0, 0, S, S);
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26; // fine grain
      img.data[i] += n;
      img.data[i + 1] += n * 0.9;
      img.data[i + 2] += n * 0.7;
    }
    ctx.putImageData(img, 0, 0);
    // a few soft darker patches for large-scale variation
    for (let k = 0; k < 40; k++) {
      ctx.globalAlpha = 0.05 + Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5 ? "#a8895f" : "#d8c39a";
      const r = 12 + Math.random() * 40;
      ctx.beginPath();
      ctx.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function Model({
  modelUrl,
  dracoUrl,
  signals,
  config,
}: {
  modelUrl: string;
  dracoUrl: string;
  signals: SignalMap;
  config?: SceneConfig;
}) {
  // Second arg = Draco decoder path (drei wires DRACOLoader for us; meshopt is
  // auto-registered by drei, so a meshopt-compressed GLB also loads).
  const { scene } = useGLTF(modelUrl, dracoUrl);

  // Let every mesh cast + receive shadows so the equipment grounds itself.
  useEffect(() => {
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }, [scene]);

  // Discover anchor empties baked in by misa-3d-asset-pipeline. Positions are
  // expressed RELATIVE TO THE SCENE ROOT (worldToLocal) so they stay correct
  // when <Bounds> applies a fit-transform to the group that holds both the
  // <primitive> and these anchors (otherwise the transform is applied twice).
  const anchors = useMemo<AnchorHit[]>(() => {
    scene.updateMatrixWorld(true);
    const hits: AnchorHit[] = [];
    scene.traverse((o) => {
      // Name = `anchor__<asset_code>__<signal>`; separator is "__" because
      // three.js strips ":" from node names on import. Split on the LAST "__".
      if (!o.name.startsWith("anchor__")) return;
      const rest = o.name.slice("anchor__".length);
      const i = rest.lastIndexOf("__");
      if (i <= 0) return;
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      scene.worldToLocal(p); // → scene-root-local (== group-local of <primitive>)
      hits.push({ assetCode: rest.slice(0, i), signal: rest.slice(i + 2), pos: [p.x, p.y, p.z] });
    });
    return hits;
  }, [scene]);

  return (
    <group>
      <primitive object={scene} />
      {anchors.map((a) => (
        <DataAnchor
          key={`${a.assetCode}:${a.signal}`}
          position={a.pos}
          assetCode={a.assetCode}
          signal={a.signal}
          live={signals[a.assetCode]?.[a.signal]}
          config={config}
        />
      ))}
    </group>
  );
}

export function TwinScene({
  modelUrl,
  signals,
  config,
  dracoUrl,
}: {
  modelUrl: string;
  signals: SignalMap;
  config?: SceneConfig;
  dracoUrl?: string;
}) {
  // Default Draco decoder folder (copy three's decoder into public/draco/ — see
  // references/performance.md). apiUrl handles the Tier0 base path.
  const draco = dracoUrl ?? "/draco/";
  const sand = useSandTexture();

  return (
    <Canvas
      // frameloop="demand" → only re-render on interaction/prop change (cheap).
      frameloop="demand"
      dpr={[1, 2]}
      shadows="soft"
      camera={{ position: [16, 11, 18], fov: 42, near: 0.1, far: 500 }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
    >
      {/* Warm hazy backdrop — lifts the scene off pure black without a jarring
          bright sky inside the dark dashboard. */}
      <color attach="background" args={["#14120e"]} />
      <fog attach="fog" args={["#14120e", 70, 190]} />

      {/* Fill + shadow-casting key. Environment (below) supplies the ambient/IBL. */}
      <hemisphereLight intensity={0.45} color={"#eae0cf"} groundColor={"#5a4b34"} />
      <directionalLight
        position={[24, 34, 14]}
        intensity={2.3}
        color={"#fff2dc"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-26, 26, 26, -26, 0.5, 120]} />
      </directionalLight>

      {/* Synthetic image-based lighting — built from Lightformers, NO external
          HDRI file, so it works offline / under the Tier0 CSP. Used for
          reflections + ambient only (not shown as background). */}
      <Environment resolution={256}>
        {/* sky dome */}
        <Lightformer form="rect" intensity={1.1} color="#bcd2f0" scale={[40, 40, 1]} position={[0, 12, -20]} />
        {/* warm sun */}
        <Lightformer form="circle" intensity={5} color="#fff1d6" scale={[8, 8, 1]} position={[16, 18, 12]} />
        {/* sand bounce from below */}
        <Lightformer
          form="rect"
          intensity={0.7}
          color="#caa96b"
          scale={[40, 40, 1]}
          position={[0, -8, 0]}
          rotation-x={Math.PI / 2}
        />
      </Environment>

      {/* Sandy desert ground (outside <Bounds> so it does not affect framing). */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial
          map={sand ?? undefined}
          color={sand ? "#ffffff" : "#c2a878"}
          roughness={1}
          metalness={0}
        />
      </mesh>

      {/* Soft contact shadow that seats the skid on the ground. */}
      <ContactShadows
        position={[0, 0.015, 0]}
        scale={80}
        far={24}
        blur={2.6}
        opacity={0.55}
        resolution={1024}
        color="#171008"
      />

      <Suspense
        fallback={
          <Html center className="text-xs text-white/70">
            Cargando geometría…
          </Html>
        }
      >
        {/* Bounds auto-frames the model ONCE on first render. Do NOT pass `observe`:
            it re-fits on every observed change, and since the live signals refresh
            ~2.5s the camera would snap back to the default framing each tick,
            throwing away the user's zoom/orbit. `fit clip` (no observe) frames on
            mount and then leaves OrbitControls in charge. */}
        <Bounds fit clip margin={1.1}>
          <Model modelUrl={modelUrl} dracoUrl={draco} signals={signals} config={config} />
        </Bounds>
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={4}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.05} // keep the camera above ground
      />
    </Canvas>
  );
}

// Preload so the tab switch feels instant. (Call from the parent if you prefer.)
// useGLTF.preload is safe to call at module scope with a static url; with a
// dynamic basePath url, call it in an effect instead.
