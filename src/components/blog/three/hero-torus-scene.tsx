"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function isDark() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

function getRingColor(dark: boolean) {
  return dark ? 0xc8845a : 0xb86a38;
}

function shouldReduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// 링 중심을 오른쪽에 배치 → 카메라가 오른쪽을 향해 오프셋되면서
// 씬 원점(0,0,0)이 화면 왼쪽(텍스트 영역) 뒤에 위치함
const RING_DEFS = [
  { r: 6.2,  tube: 0.028, pos: [0,  0,  0] as [number,number,number], rotSpeed: [ 0.0008,  0.0014,  0      ], opacity: 0.38 },
  { r: 9.5,  tube: 0.018, pos: [0,  0, -2] as [number,number,number], rotSpeed: [ 0.0005, -0.0008,  0.0004 ], opacity: 0.22 },
  { r: 4.1,  tube: 0.040, pos: [3, -1,  1] as [number,number,number], rotSpeed: [-0.0012,  0.0006,  0.001  ], opacity: 0.45 },
  { r: 13,   tube: 0.012, pos: [0,  0, -6] as [number,number,number], rotSpeed: [ 0.0003,  0.0005, -0.0002 ], opacity: 0.12 },
  { r: 7.8,  tube: 0.022, pos: [-4, 2, -4] as [number,number,number], rotSpeed: [ 0.001,  -0.001,   0.0006 ], opacity: 0.20 },
  { r: 3.0,  tube: 0.035, pos: [-2,-2,  3] as [number,number,number], rotSpeed: [-0.002,   0.0008, -0.001  ], opacity: 0.35 },
] as const;

export function HeroTorusScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldReduceMotion()) return;

    /* ── Renderer ────────────────────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    /* ── Scene & Camera ──────────────────────────────────────────────── */
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    // x를 오른쪽으로 오프셋 → 씬 원점이 화면 왼쪽(헤드라인 텍스트 뒤)에 위치
    camera.position.set(8, 0, 26);
    camera.lookAt(0, 0, 0);

    /* ── Torus rings ─────────────────────────────────────────────────── */
    const color = getRingColor(isDark());

    const meshes = RING_DEFS.map((d) => {
      const geo  = new THREE.TorusGeometry(d.r, d.tube, 4, 80);
      const mat  = new THREE.MeshBasicMaterial({
        color,
        wireframe: false,
        transparent: true,
        opacity: d.opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...d.pos);
      mesh.rotation.x = Math.random() * Math.PI;
      mesh.rotation.y = Math.random() * Math.PI;
      scene.add(mesh);
      return { mesh, mat, rotSpeed: d.rotSpeed, baseOpacity: d.opacity };
    });

    /* ── Dark mode observer ──────────────────────────────────────────── */
    const themeObserver = new MutationObserver(() => {
      const c = getRingColor(isDark());
      meshes.forEach(({ mat }) => mat.color.set(c));
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    /* ── Resize ──────────────────────────────────────────────────────── */
    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    /* ── Mouse parallax ──────────────────────────────────────────────── */
    const mouse = { x: 0, y: 0 };
    function onMouseMove(e: MouseEvent) {
      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    }
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    /* ── Animation loop ──────────────────────────────────────────────── */
    let animId = 0;

    function tick() {
      animId = requestAnimationFrame(tick);

      meshes.forEach(({ mesh, rotSpeed }) => {
        mesh.rotation.x += rotSpeed[0];
        mesh.rotation.y += rotSpeed[1];
        mesh.rotation.z += rotSpeed[2];
      });

      // Camera parallax — 기준점 x=8 유지하면서 마우스 오프셋 추가
      camera.position.x += (8 + mouse.x * 2   - camera.position.x) * 0.04;
      camera.position.y += (    mouse.y * 1.8  - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    tick();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      meshes.forEach(({ mesh, mat }) => {
        mesh.geometry.dispose();
        mat.dispose();
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      aria-hidden
    />
  );
}
