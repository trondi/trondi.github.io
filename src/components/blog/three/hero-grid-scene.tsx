"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function shouldReduceMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroGridScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || shouldReduceMotion()) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 1.8, 6.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(10, 8, 28, 22);
    const material = new THREE.MeshBasicMaterial({
      color: 0x334155,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -1.1;
    scene.add(mesh);

    const accentGeometry = new THREE.IcosahedronGeometry(1.25, 1);
    const accentMaterial = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    const accent = new THREE.Mesh(accentGeometry, accentMaterial);
    accent.position.set(2.35, 1.3, -1);
    scene.add(accent);

    const pointer = new THREE.Vector2(0, 0);
    const base = Float32Array.from(
      geometry.attributes.position.array as ArrayLike<number>,
    );

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    resize();
    container.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    let animationId = 0;

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const attribute = geometry.attributes.position;

      for (let i = 0; i < attribute.count; i += 1) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        attribute.setZ(
          i,
          Math.sin(x * 0.85 + elapsed * 1.2) * 0.22 +
            Math.cos(y * 1.2 + elapsed * 1.1) * 0.18 +
            pointer.x * 0.12,
        );
      }

      attribute.needsUpdate = true;
      mesh.rotation.z = pointer.x * 0.08;
      mesh.position.x = pointer.x * 0.22;
      accent.rotation.x = elapsed * 0.45;
      accent.rotation.y = elapsed * 0.65;
      accent.position.y = 1.3 + pointer.y * 0.3;

      renderer.render(scene, camera);
      animationId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationId);
      geometry.dispose();
      material.dispose();
      accentGeometry.dispose();
      accentMaterial.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 rounded-[28px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.95),rgba(0,0,0,0.45),transparent)]"
      aria-hidden
    />
  );
}
