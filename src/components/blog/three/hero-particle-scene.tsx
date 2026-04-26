"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function isDark() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

function getScheme(dark: boolean) {
  if (dark) {
    return {
      particleA: new THREE.Color(0xc8845a),  // warm sienna
      particleB: new THREE.Color(0xe0a878),  // lighter amber
      line: 0xc8845a,
    };
  }
  return {
    particleA: new THREE.Color(0xb86a38),
    particleB: new THREE.Color(0xd08050),
    line: 0xb86a38,
  };
}

function shouldReduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const N            = 160;
const MAX_SEGMENTS = 4000;
const CONNECT_DIST = 7;
const CONNECT_D2   = CONNECT_DIST * CONNECT_DIST;
const SPEED        = 0.4;

export function HeroParticleScene() {
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
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
    camera.position.set(0, 0, 24);

    /* ── Particles ───────────────────────────────────────────────────── */
    const pPos = new Float32Array(N * 3);
    const pVel = new Float32Array(N * 3);
    const pCol = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      pPos[i * 3]     = (Math.random() - 0.5) * 46;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 28;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
      pVel[i * 3]     = (Math.random() - 0.5) * 0.02;
      pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.014;
      pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.008;
    }

    const scheme = getScheme(isDark());

    for (let i = 0; i < N; i++) {
      const c = Math.random() > 0.72 ? scheme.particleB : scheme.particleA;
      pCol[i * 3]     = c.r;
      pCol[i * 3 + 1] = c.g;
      pCol[i * 3 + 2] = c.b;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color",    new THREE.BufferAttribute(pCol, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      sizeAttenuation: true,
    });

    scene.add(new THREE.Points(pGeo, pMat));

    /* ── Lines ───────────────────────────────────────────────────────── */
    const lPos = new Float32Array(MAX_SEGMENTS * 6);
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute("position", new THREE.BufferAttribute(lPos, 3));
    lGeo.setDrawRange(0, 0);

    const lMat = new THREE.LineBasicMaterial({
      color: scheme.line,
      transparent: true,
      opacity: 0.22,
    });

    scene.add(new THREE.LineSegments(lGeo, lMat));

    /* ── Resize ──────────────────────────────────────────────────────── */
    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
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

    /* ── Dark mode observer ──────────────────────────────────────────── */
    const observer = new MutationObserver(() => {
      const s = getScheme(isDark());
      lMat.color.set(s.line);
      for (let i = 0; i < N; i++) {
        const c = Math.random() > 0.72 ? s.particleB : s.particleA;
        pCol[i * 3]     = c.r;
        pCol[i * 3 + 1] = c.g;
        pCol[i * 3 + 2] = c.b;
      }
      pGeo.attributes.color.needsUpdate = true;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    /* ── Animation loop ──────────────────────────────────────────────── */
    let animId = 0;

    function animate() {
      animId = requestAnimationFrame(animate);

      // Drift particles + wrap around
      for (let i = 0; i < N; i++) {
        pPos[i * 3]     += pVel[i * 3]     * SPEED;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * SPEED;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * SPEED;
        if (pPos[i * 3]     >  23) pPos[i * 3]     = -23;
        if (pPos[i * 3]     < -23) pPos[i * 3]     =  23;
        if (pPos[i * 3 + 1] >  14) pPos[i * 3 + 1] = -14;
        if (pPos[i * 3 + 1] < -14) pPos[i * 3 + 1] =  14;
        if (pPos[i * 3 + 2] >   6) pPos[i * 3 + 2] =  -6;
        if (pPos[i * 3 + 2] <  -6) pPos[i * 3 + 2] =   6;
      }
      pGeo.attributes.position.needsUpdate = true;

      // Build connection lines
      let lc = 0;
      for (let i = 0; i < N && lc < MAX_SEGMENTS; i++) {
        for (let j = i + 1; j < N && lc < MAX_SEGMENTS; j++) {
          const dx = pPos[i * 3]     - pPos[j * 3];
          const dy = pPos[i * 3 + 1] - pPos[j * 3 + 1];
          const dz = pPos[i * 3 + 2] - pPos[j * 3 + 2];
          if (dx * dx + dy * dy + dz * dz < CONNECT_D2) {
            const b = lc * 6;
            lPos[b]     = pPos[i * 3];     lPos[b + 1] = pPos[i * 3 + 1]; lPos[b + 2] = pPos[i * 3 + 2];
            lPos[b + 3] = pPos[j * 3];     lPos[b + 4] = pPos[j * 3 + 1]; lPos[b + 5] = pPos[j * 3 + 2];
            lc++;
          }
        }
      }
      lGeo.setDrawRange(0, lc * 2);
      lGeo.attributes.position.needsUpdate = true;

      // Camera parallax from mouse
      camera.position.x += (mouse.x * 2.8 - camera.position.x) * 0.035;
      camera.position.y += (mouse.y * 1.6 - camera.position.y) * 0.035;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      observer.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      pGeo.dispose();
      lGeo.dispose();
      pMat.dispose();
      lMat.dispose();
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
