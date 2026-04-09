"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getSeason, SEASON_CONFIG } from "@/lib/season";
import type { Season } from "@/lib/season";

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSway;
  attribute float aRotSpeed;
  attribute float aDepth;

  uniform float uTime;
  uniform vec2  uMouse;         // NDC -1..1
  uniform float uGravity;
  uniform float uSway;
  uniform float uSpreadY;

  varying float vPhase;
  varying float vLife;          // 0 (just spawned) → 1 (about to reset)

  void main() {
    float cycle = mod(uTime * uGravity + aPhase, 1.0); // 0..1 fall cycle
    vLife   = cycle;
    vPhase  = aPhase;

    // Y: fall from top to bottom
    float y = mix(uSpreadY, -uSpreadY, cycle);

    // X: gentle horizontal sway
    float swayAmt = uSway * aSway;
    float x = position.x + sin(uTime * 0.5 + aPhase * 6.28 + cycle * 3.14) * swayAmt;

    // Mouse repel (mild)
    vec2 mouseWorld = uMouse * vec2(11.0, 7.0);
    vec2 toMouse = vec2(x, y) - mouseWorld;
    float dist = length(toMouse);
    if (dist < 2.5) {
      float str = (1.0 - dist / 2.5) * 1.2;
      x += normalize(toMouse).x * str;
    }

    float z = position.z;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_PointSize = aSize * (150.0 / -mvPosition.z);
    gl_Position  = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3  uColor;
  uniform float uTime;

  varying float vPhase;
  varying float vLife;

  void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = length(uv);
    if (d > 0.5) discard;

    // Soft disc
    float alpha = 1.0 - smoothstep(0.3, 0.5, d);

    // Fade in at birth, fade out at death
    float fade = smoothstep(0.0, 0.08, vLife) * smoothstep(1.0, 0.9, vLife);
    alpha *= fade * 0.78;

    // Summer firefly: pulse glow
    float glow = 0.5 + 0.5 * sin(uTime * 3.0 + vPhase * 6.28);
    alpha *= mix(1.0, glow, 0.5);

    gl_FragColor = vec4(uColor, alpha);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

function isDark() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

export function SeasonalScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const season = getSeason();
  const cfg = SEASON_CONFIG[season];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const N = cfg.count;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 12);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Geometry attributes
    const positions = new Float32Array(N * 3);
    const sizes     = new Float32Array(N);
    const phases    = new Float32Array(N);
    const sways     = new Float32Array(N);
    const rotSpeeds = new Float32Array(N);
    const depths    = new Float32Array(N);

    const [sx, sy, sz] = cfg.spread;

    for (let i = 0; i < N; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * sx;
      positions[i * 3 + 1] = (Math.random() - 0.5) * sy; // initial Y scattered
      positions[i * 3 + 2] = (Math.random() - 0.5) * sz;
      sizes[i]     = cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]);
      phases[i]    = Math.random();           // stagger fall cycle
      sways[i]     = 0.5 + Math.random();
      rotSpeeds[i] = (Math.random() - 0.5) * cfg.rotSpeed;
      depths[i]    = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize",    new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase",   new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSway",    new THREE.BufferAttribute(sways, 1));
    geo.setAttribute("aRotSpeed",new THREE.BufferAttribute(rotSpeeds, 1));
    geo.setAttribute("aDepth",   new THREE.BufferAttribute(depths, 1));

    const dark = isDark();
    const [r, g, b] = dark ? cfg.darkColor : cfg.color;

    const uniforms = {
      uTime:    { value: 0 },
      uMouse:   { value: new THREE.Vector2(0, 0) },
      uColor:   { value: new THREE.Color(r, g, b) },
      uGravity: { value: cfg.gravity * 0.08 },  // controls fall speed
      uSway:    { value: cfg.sway },
      uSpreadY: { value: sy * 0.5 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      depthWrite:  false,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Mouse
    const mouse       = new THREE.Vector2(0, 0);
    const targetMouse = new THREE.Vector2(0, 0);

    const onMouseMove = (e: MouseEvent) => {
      targetMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      targetMouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    // Touch support
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      targetMouse.x =  (t.clientX / window.innerWidth)  * 2 - 1;
      targetMouse.y = -((t.clientY / window.innerHeight) * 2 - 1);
    };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    // Theme observer
    const themeObserver = new MutationObserver(() => {
      const d = isDark();
      const [cr, cg, cb] = d ? cfg.darkColor : cfg.color;
      uniforms.uColor.value.setRGB(cr, cg, cb);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    resize();
    window.addEventListener("mousemove",  onMouseMove,  { passive: true });
    window.addEventListener("touchmove",  onTouchMove,  { passive: true });
    window.addEventListener("resize",     resize);

    const clock = new THREE.Clock();
    let animId  = 0;

    const animate = () => {
      uniforms.uTime.value = clock.getElapsedTime();
      mouse.x += (targetMouse.x - mouse.x) * 0.04;
      mouse.y += (targetMouse.y - mouse.y) * 0.04;
      uniforms.uMouse.value.set(mouse.x, mouse.y);
      renderer.render(scene, camera);
      animId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize",    resize);
      window.cancelAnimationFrame(animId);
      themeObserver.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [cfg]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
      data-season={season}
    />
  );
}

