"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type CategorySceneProps = {
  slug: string;
};

type Variant =
  | "frontend-flow"
  | "react-rings"
  | "typescript-columns"
  | "ui-blob"
  | "troubleshooting-shards"
  | "til-notes"
  | "project-blueprint";

function shouldReduceMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getVariant(slug: string) {
  if (slug === "frontend") {
    return "frontend-flow" as Variant;
  }

  if (slug.includes("react") || slug.includes("nextjs")) {
    return "react-rings" as Variant;
  }

  if (slug.includes("javascript") || slug.includes("typescript")) {
    return "typescript-columns" as Variant;
  }

  if (slug.includes("css") || slug.includes("ui")) {
    return "ui-blob" as Variant;
  }

  if (slug.includes("trouble")) {
    return "troubleshooting-shards" as Variant;
  }

  if (slug === "til") {
    return "til-notes" as Variant;
  }

  return "project-blueprint" as Variant;
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function CategoryScene({ slug }: CategorySceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setThemeVersion((value) => value + 1);
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || shouldReduceMotion()) {
      return;
    }

    const variant = getVariant(slug);
    const isDark = document.documentElement.classList.contains("dark");
    const lineColor = isDark ? 0xf5f5f4 : 0x475569;
    const softLineColor = isDark ? 0xe7e5e4 : 0x94a3b8;
    const fillColor = isDark ? 0xf4f4f5 : 0x1e293b;
    const softFillColor = isDark ? 0xffffff : 0xe2e8f0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);
    const disposable: Array<{ dispose: () => void }> = [];
    const wobbleX = randomRange(0.06, 0.1);
    const wobbleY = randomRange(0.14, 0.22);
    const floatAmount = randomRange(0.08, 0.16);
    const pointer = new THREE.Vector2(0, 0);

    if (variant === "frontend-flow") {
      const material = new THREE.MeshBasicMaterial({
        color: softFillColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isDark ? 0.08 : 0.12,
      });
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: isDark ? 0.34 : 0.22,
      });

      const ribbonCount = Math.round(randomRange(3.6, 4.4));

      for (let i = 0; i < ribbonCount; i += 1) {
        const geometry = new THREE.PlaneGeometry(
          5.5 - i * randomRange(0.45, 0.6),
          randomRange(0.66, 0.82),
          22,
          4,
        );
        const position = geometry.attributes.position;

        for (let j = 0; j < position.count; j += 1) {
          const x = position.getX(j);
          const y = position.getY(j);
          position.setZ(
            j,
            Math.sin(x * randomRange(1.2, 1.6) + i) * randomRange(0.12, 0.22) +
              Math.cos(y * randomRange(2.1, 2.9)) * randomRange(0.08, 0.14),
          );
        }

        const ribbon = new THREE.Mesh(geometry, material);
        ribbon.position.y = (i - (ribbonCount - 1) / 2) * randomRange(0.64, 0.8);
        ribbon.position.x = randomRange(-0.2, 0.2);
        ribbon.rotation.x = randomRange(-0.55, -0.35);
        ribbon.rotation.z = i * randomRange(0.05, 0.11);
        group.add(ribbon);
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial));
        disposable.push(geometry);
      }

      disposable.push(material, edgeMaterial);
    } else if (variant === "react-rings") {
      const material = new THREE.MeshBasicMaterial({
        color: isDark ? 0xf1f5f9 : 0x0f172a,
        wireframe: true,
        transparent: true,
        opacity: isDark ? 0.34 : 0.28,
      });

      for (let i = 0; i < 3; i += 1) {
        const geometry = new THREE.TorusGeometry(
          randomRange(1.45, 1.7) + i * randomRange(0.38, 0.52),
          randomRange(0.028, 0.04),
          16,
          90,
        );
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = i * randomRange(0.52, 0.74);
        ring.rotation.y = i * randomRange(0.34, 0.56);
        group.add(ring);
        disposable.push(geometry);
      }

      disposable.push(material);
    } else if (variant === "typescript-columns") {
      const material = new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity: isDark ? 0.08 : 0.16,
      });
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: isDark ? 0.42 : 0.32,
      });

      const columnCount = 7;
      for (let i = 0; i < columnCount; i += 1) {
        const height = randomRange(0.9, 1.2) + (i % 3) * randomRange(0.5, 0.82);
        const width = randomRange(0.42, 0.58);
        const geometry = new THREE.BoxGeometry(width, height, width, 2, 4, 2);
        const column = new THREE.Mesh(geometry, material);
        column.position.x = (i - 3) * randomRange(0.64, 0.78);
        column.position.y = Math.sin(i * randomRange(1.15, 1.42)) * randomRange(0.12, 0.24);
        column.position.z = randomRange(-0.2, 0.2);
        column.rotation.x = randomRange(0.24, 0.42);
        column.rotation.y = randomRange(0.38, 0.62) + i * randomRange(0.04, 0.1);
        group.add(column);
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial));
        disposable.push(geometry);
      }

      const guideGeometry = new THREE.BufferGeometry();
      guideGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [-2.9, -1.6, 0, 2.9, -1.6, 0, -2.9, 1.6, 0, 2.9, 1.6, 0],
          3,
        ),
      );
      const guideMaterial = new THREE.LineBasicMaterial({
        color: softLineColor,
        transparent: true,
        opacity: isDark ? 0.32 : 0.22,
      });
      group.add(new THREE.LineSegments(guideGeometry, guideMaterial));
      disposable.push(material, edgeMaterial, guideGeometry, guideMaterial);
    } else if (variant === "ui-blob") {
      const geometry = new THREE.IcosahedronGeometry(2.1, 8);
      const position = geometry.attributes.position;
      const source = Float32Array.from(position.array as ArrayLike<number>);

      for (let i = 0; i < position.count; i += 1) {
        const noise = randomRange(0.14, 0.24) * Math.sin(i * randomRange(0.28, 0.46));
        position.setXYZ(
          i,
          source[i * 3] * (1 + noise),
          source[i * 3 + 1] * (1 - noise * 0.7),
          source[i * 3 + 2] * (1 + noise * 0.5),
        );
      }

      const material = new THREE.MeshBasicMaterial({
        color: isDark ? 0xffffff : 0xe2e8f0,
        transparent: true,
        opacity: isDark ? 0.16 : 0.34,
      });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      const pointsGeometry = new THREE.BufferGeometry();
      pointsGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array(position.array as ArrayLike<number>),
          3,
        ),
      );
      const pointsMaterial = new THREE.PointsMaterial({
        color: lineColor,
        size: 0.045,
        transparent: true,
        opacity: isDark ? 0.68 : 0.58,
      });
      group.add(new THREE.Points(pointsGeometry, pointsMaterial));
      disposable.push(geometry, material, pointsGeometry, pointsMaterial);
    } else if (variant === "troubleshooting-shards") {
      const material = new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity: isDark ? 0.08 : 0.18,
      });
      const lineMaterial = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: isDark ? 0.4 : 0.3,
      });

      const shardCount = 8;
      for (let i = 0; i < shardCount; i += 1) {
        const geometry = new THREE.TetrahedronGeometry(
          randomRange(0.48, 0.62) + (i % 3) * randomRange(0.1, 0.2),
          0,
        );
        const shard = new THREE.Mesh(geometry, material);
        shard.position.set(
          (i - 3.5) * randomRange(0.58, 0.76),
          Math.sin(i * randomRange(1.35, 1.8)) * randomRange(0.42, 0.65),
          Math.cos(i * randomRange(0.65, 0.95)) * randomRange(0.42, 0.72),
        );
        shard.rotation.set(
          i * randomRange(0.35, 0.62),
          i * randomRange(0.64, 0.96),
          i * randomRange(0.18, 0.34),
        );
        group.add(shard);
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial));
        disposable.push(geometry);
      }

      disposable.push(material, lineMaterial);
    } else if (variant === "til-notes") {
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: isDark ? 0xf8fafc : 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isDark ? 0.16 : 0.55,
      });
      const lineMaterial = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: isDark ? 0.4 : 0.3,
      });

      const noteCount = 5;
      for (let i = 0; i < noteCount; i += 1) {
        const geometry = new THREE.PlaneGeometry(
          randomRange(1.22, 1.52),
          randomRange(1.6, 1.92),
          1,
          1,
        );
        const note = new THREE.Mesh(geometry, fillMaterial);
        note.position.set(
          (i - 2) * randomRange(0.82, 0.98),
          Math.cos(i * randomRange(1.15, 1.6)) * randomRange(0.18, 0.3),
          Math.sin(i * randomRange(0.72, 1.02)) * randomRange(0.22, 0.34),
        );
        note.rotation.set(
          randomRange(-0.28, -0.12) + i * randomRange(0.04, 0.09),
          randomRange(-0.42, -0.24) + i * randomRange(0.1, 0.16),
          i * randomRange(0.03, 0.08),
        );
        group.add(note);
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial));
        disposable.push(geometry);
      }

      const pinGeometry = new THREE.BufferGeometry();
      pinGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [-2.2, 0.7, 0, -1.1, -0.4, 0, -0.2, 0.9, 0, 0.9, -0.3, 0, 1.9, 0.55, 0],
          3,
        ),
      );
      const pinMaterial = new THREE.PointsMaterial({
        color: isDark ? 0xffffff : 0x0f172a,
        size: 0.12,
        transparent: true,
        opacity: isDark ? 0.7 : 0.55,
      });
      group.add(new THREE.Points(pinGeometry, pinMaterial));
      disposable.push(fillMaterial, lineMaterial, pinGeometry, pinMaterial);
    } else {
      const frameGeometries = [
        new THREE.BoxGeometry(4.8, 2.7, 0.45, 3, 2, 2),
        new THREE.BoxGeometry(3.4, 1.8, 0.65, 2, 2, 2),
        new THREE.BoxGeometry(1.3, 1.2, 1.2, 2, 2, 2),
      ];
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: isDark ? 0.42 : 0.34,
      });

      frameGeometries.forEach((geometry, index) => {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
        edges.rotation.x = randomRange(0.3, 0.44) + index * randomRange(0.05, 0.1);
        edges.rotation.y = randomRange(0.42, 0.62) + index * randomRange(0.16, 0.28);
        edges.position.z = index * randomRange(0.14, 0.24);
        group.add(edges);
        disposable.push(geometry);
      });

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            -1.6, 0.9, 0.7, -0.4, 0.2, 0.3,
            0.2, -0.1, 0.3, 1.4, -0.8, 0.7,
            -1.5, -0.9, -0.4, -0.5, -0.2, 0.1,
            0.5, 0.3, 0.1, 1.5, 0.9, -0.4,
          ],
          3,
        ),
      );
      const lineMaterial = new THREE.LineBasicMaterial({
        color: softLineColor,
        transparent: true,
        opacity: isDark ? 0.34 : 0.22,
      });
      group.add(new THREE.LineSegments(lineGeometry, lineMaterial));
      disposable.push(edgeMaterial, lineGeometry, lineMaterial);
    }

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const onPointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };

    resize();
    window.addEventListener("resize", resize);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);

    const clock = new THREE.Clock();
    let animationId = 0;

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      group.rotation.x = elapsed * wobbleX + pointer.y * 0.22;
      group.rotation.y = elapsed * wobbleY + pointer.x * 0.35;
      group.rotation.z = pointer.x * 0.08;
      group.position.x += (pointer.x * 0.45 - group.position.x) * 0.06;
      group.position.y += (Math.sin(elapsed * 0.45) * floatAmount + pointer.y * 0.24 - group.position.y) * 0.06;
      renderer.render(scene, camera);
      animationId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      window.cancelAnimationFrame(animationId);
      disposable.forEach((item) => item.dispose());
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [slug, themeVersion]);

  return (
    <div
      ref={containerRef}
      className="h-40 w-full rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.65))] dark:bg-[linear-gradient(180deg,rgba(39,39,42,0.92),rgba(24,24,27,0.9))]"
      aria-hidden
    />
  );
}
