"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const PARTICLE_COUNT = 180;

// Vertex shader: animate particles, repel from mouse
const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aInitialPosition;
  attribute float aSpeed;
  attribute float aSize;

  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uRepelRadius;
  uniform float uRepelForce;

  varying float vAlpha;

  void main() {
    vec3 pos = aInitialPosition;
    pos.x += sin(uTime * aSpeed * 0.4 + aInitialPosition.z * 3.14) * 0.35;
    pos.y += cos(uTime * aSpeed * 0.32 + aInitialPosition.x * 2.71) * 0.28;
    pos.z += sin(uTime * aSpeed * 0.22 + aInitialPosition.y * 1.62) * 0.18;

    // Mouse repel (mouse in -1..1 NDC, mapped to scene bounds ~±10, ±7)
    vec2 mouseWorld = uMouse * vec2(10.0, 7.0);
    vec2 toMouse = pos.xy - mouseWorld;
    float dist = length(toMouse);
    if (dist < uRepelRadius && dist > 0.001) {
      float strength = (1.0 - dist / uRepelRadius) * uRepelForce;
      pos.xy += normalize(toMouse) * strength;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    // Distance-based size attenuation
    gl_PointSize = aSize * (180.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;

    float mouseFade = dist < uRepelRadius
      ? 0.35 + 0.65 * (dist / uRepelRadius)
      : 1.0;
    vAlpha = (0.35 + 0.5 * aSize / 5.0) * mouseFade;
  }
`;

// Fragment shader: soft circular particles
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = (1.0 - smoothstep(0.28, 0.5, d)) * vAlpha;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function isDark() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

function getParticleColor(dark: boolean): THREE.Color {
  return dark ? new THREE.Color(0x484848) : new THREE.Color(0x94a3b8);
}

export function AmbientScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 12);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Particle attributes
    const initPos = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const sizes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      initPos[i * 3 + 0] = (Math.random() - 0.5) * 20;
      initPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      initPos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      speeds[i] = 0.4 + Math.random() * 0.8;
      sizes[i] = 1.5 + Math.random() * 3.5;
    }

    const geometry = new THREE.BufferGeometry();
    // position attribute (required by Three.js for frustum culling)
    geometry.setAttribute("position", new THREE.BufferAttribute(initPos.slice(), 3));
    geometry.setAttribute("aInitialPosition", new THREE.BufferAttribute(initPos, 3));
    geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const dark = isDark();
    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uRepelRadius: { value: 3.0 },
      uRepelForce: { value: 1.6 },
      uColor: { value: getParticleColor(dark) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Mouse tracking (smooth)
    const mouse = new THREE.Vector2(0, 0);
    const targetMouse = new THREE.Vector2(0, 0);

    const onMouseMove = (e: MouseEvent) => {
      targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    // Dark mode observer
    const themeObserver = new MutationObserver(() => {
      uniforms.uColor.value = getParticleColor(isDark());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    resize();
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    let animId = 0;

    const animate = () => {
      uniforms.uTime.value = clock.getElapsedTime();
      mouse.x += (targetMouse.x - mouse.x) * 0.05;
      mouse.y += (targetMouse.y - mouse.y) * 0.05;
      uniforms.uMouse.value.set(mouse.x, mouse.y);
      renderer.render(scene, camera);
      animId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animId);
      themeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 -z-10 opacity-60"
      aria-hidden
    />
  );
}
