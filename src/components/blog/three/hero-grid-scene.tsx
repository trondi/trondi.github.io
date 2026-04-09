"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Inline Simplex noise (2D) — no external dependency
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uScrollProgress;

  varying float vElevation;
  varying vec2 vUv;

  // Simplex 2D noise by Ashima Arts
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                     + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                             dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x  = 2.0 * fract(p * C.www) - 1.0;
    vec3 h  = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x * x0.x  + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vUv = uv;

    // Layered noise for organic displacement
    float n1 = snoise(vec2(position.x * 0.6 + uTime * 0.4, position.y * 0.6 + uTime * 0.35));
    float n2 = snoise(vec2(position.x * 1.4 - uTime * 0.28, position.y * 1.1 + uTime * 0.22)) * 0.5;
    float n3 = snoise(vec2(position.x * 2.8 + uTime * 0.18, position.y * 2.4 - uTime * 0.15)) * 0.25;

    float elevation = (n1 + n2 + n3) * 0.38;
    // Mouse influence
    elevation += uMouse.x * 0.14 * sin(position.y * 0.5 + uTime);
    elevation += uMouse.y * 0.08 * cos(position.x * 0.5 + uTime);

    vElevation = elevation;

    vec3 newPosition = position;
    newPosition.z += elevation;

    // Scroll: tilt the grid back as user scrolls
    newPosition.y -= uScrollProgress * 1.2;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform float uOpacity;

  varying float vElevation;
  varying vec2 vUv;

  void main() {
    // Map elevation to 0..1
    float t = clamp((vElevation + 0.38) / 0.76, 0.0, 1.0);
    // Smooth step for more contrast
    t = smoothstep(0.0, 1.0, t);

    vec3 color = mix(uColorLow, uColorHigh, t);

    // Edge fade via UV distance from centre
    vec2 centreUv = vUv - 0.5;
    float edgeFade = 1.0 - smoothstep(0.28, 0.5, length(centreUv));

    gl_FragColor = vec4(color, uOpacity * edgeFade);
  }
`;

function shouldReduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function getColors(dark: boolean) {
  if (dark) {
    return {
      low: new THREE.Color(0x1a1a1a),
      high: new THREE.Color(0x5a5a5a),
      accent: new THREE.Color(0x444444),
    };
  }
  return {
    low: new THREE.Color(0xc8d0dc),
    high: new THREE.Color(0x475569),
    accent: new THREE.Color(0x94a3b8),
  };
}

export function HeroGridScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldReduceMotion()) return;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 1.8, 6.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Geometry
    const geometry = new THREE.PlaneGeometry(14, 10, 36, 28);
    const dark = isDark();
    const colors = getColors(dark);

    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uScrollProgress: { value: 0 },
      uColorLow: { value: colors.low },
      uColorHigh: { value: colors.high },
      uOpacity: { value: dark ? 0.55 : 0.48 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      wireframe: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -1.1;
    scene.add(mesh);

    // Accent icosahedron — also with shader
    const accentGeo = new THREE.IcosahedronGeometry(1.4, 1);
    const accentUniforms = {
      uTime: uniforms.uTime,
      uMouse: uniforms.uMouse,
      uScrollProgress: uniforms.uScrollProgress,
      uColorLow: { value: colors.accent },
      uColorHigh: { value: colors.high },
      uOpacity: { value: dark ? 0.2 : 0.16 },
    };
    const accentMat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: accentUniforms,
      transparent: true,
      wireframe: true,
    });
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(2.5, 1.4, -1);
    scene.add(accent);

    // Pointer
    const pointer = new THREE.Vector2(0, 0);
    const targetPointer = new THREE.Vector2(0, 0);

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      targetPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      targetPointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };

    // Scroll
    const onScroll = () => {
      const hero = container.closest("section");
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -rect.top / (rect.height * 0.6)));
      uniforms.uScrollProgress.value = progress;
    };

    // Resize
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    // Dark mode observer — update uniforms
    const themeObserver = new MutationObserver(() => {
      const d = isDark();
      const c = getColors(d);
      uniforms.uColorLow.value = c.low;
      uniforms.uColorHigh.value = c.high;
      uniforms.uOpacity.value = d ? 0.55 : 0.48;
      accentUniforms.uColorLow.value = c.accent;
      accentUniforms.uOpacity.value = d ? 0.2 : 0.16;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    resize();
    container.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });

    const clock = new THREE.Clock();
    let animId = 0;

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      uniforms.uTime.value = elapsed;

      // Smooth pointer lerp
      pointer.x += (targetPointer.x - pointer.x) * 0.06;
      pointer.y += (targetPointer.y - pointer.y) * 0.06;
      uniforms.uMouse.value.set(pointer.x, pointer.y);

      accent.rotation.x = elapsed * 0.38;
      accent.rotation.y = elapsed * 0.55;
      accent.position.y = 1.4 + pointer.y * 0.28;

      renderer.render(scene, camera);
      animId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(animId);
      themeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      accentGeo.dispose();
      accentMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.9)_0%,rgba(0,0,0,0.6)_60%,transparent_100%)]"
      aria-hidden
    />
  );
}
