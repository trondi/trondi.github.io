"use client";

import { useEffect, useRef } from "react";
import { useSeasonalContext } from "@/components/blog/seasonal-context";
import type { Season } from "@/lib/season";

// ─── Particle ──────────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  size: number;
  opacity: number;
  swayPhase: number;
  colorIdx: number;
}

// ─── Per-season settings ───────────────────────────────────────────────────────

const CFG = {
  spring: {
    count: 55,
    colors: [
      "rgba(255,192,203,",
      "rgba(255,160,180,",
      "rgba(255,210,220,",
      "rgba(245,155,175,",
    ],
    sizeRange: [7, 17] as [number, number],
    gyRange: [0.7, 1.5] as [number, number],   // gravity y
    swayAmp: 1.6,
  },
  summer: {
    count: 40,
    colors: [
      "rgba(88,170,78,",
      "rgba(68,150,60,",
      "rgba(110,185,90,",
      "rgba(55,135,50,",
    ],
    sizeRange: [9, 20] as [number, number],
    gyRange: [0.55, 1.1] as [number, number],
    swayAmp: 2.0,
  },
  autumn: {
    count: 65,
    colors: [
      "rgba(210,75,20,",
      "rgba(225,120,25,",
      "rgba(185,55,15,",
      "rgba(245,160,35,",
      "rgba(165,35,10,",
    ],
    sizeRange: [10, 22] as [number, number],
    gyRange: [0.9, 1.9] as [number, number],
    swayAmp: 2.5,
  },
  winter: {
    count: 90,
    colors: [
      "rgba(200,220,255,",
      "rgba(220,235,255,",
      "rgba(180,205,250,",
    ],
    sizeRange: [4, 13] as [number, number],
    gyRange: [0.35, 0.9] as [number, number],
    swayAmp: 0.6,
  },
} as const;

// ─── Shape drawers ─────────────────────────────────────────────────────────────

function drawPetal(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  opacity: number,
) {
  const a = `${color}${opacity})`;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.55, -size * 0.5, size * 0.55, size * 0.5, 0, size);
  ctx.bezierCurveTo(-size * 0.55, size * 0.5, -size * 0.55, -size * 0.5, 0, -size);
  ctx.fillStyle = a;
  ctx.fill();

  // subtle centre crease
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.85);
  ctx.lineTo(0, size * 0.85);
  ctx.strokeStyle = `${color}${opacity * 0.35})`;
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  opacity: number,
) {
  // elongated oval with pointed ends
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.58, -size * 0.3, size * 0.58, size * 0.3, 0, size);
  ctx.bezierCurveTo(-size * 0.58, size * 0.3, -size * 0.58, -size * 0.3, 0, -size);
  ctx.fillStyle = `${color}${opacity})`;
  ctx.fill();

  // mid vein
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.9);
  ctx.lineTo(0, size * 0.9);
  ctx.strokeStyle = `rgba(40,90,35,${opacity * 0.45})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // 3 side veins each side
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const y = -size + size * 2 * t;
    const xEnd = size * 0.38 * Math.sin(t * Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(xEnd, y + size * 0.14);
    ctx.moveTo(0, y);
    ctx.lineTo(-xEnd, y + size * 0.14);
    ctx.strokeStyle = `rgba(40,90,35,${opacity * 0.28})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function drawAutumnLeaf(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  opacity: number,
) {
  // 5-pointed maple-ish silhouette
  const outerR = size * 0.92;
  const innerR = size * 0.32;
  const points = 5;

  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = `${color}${opacity})`;
  ctx.fill();

  // stem
  ctx.beginPath();
  ctx.moveTo(0, size * 0.28);
  ctx.lineTo(0, size * 0.82);
  ctx.strokeStyle = `rgba(100,45,12,${opacity * 0.85})`;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  size: number,
  opacity: number,
) {
  ctx.strokeStyle = `rgba(200,225,255,${opacity})`;
  ctx.lineCap = "round";

  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);

    // main arm
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size);
    ctx.stroke();

    // branches at 55% and 78%
    ([0.55, 0.78] as const).forEach((pos) => {
      const y = -size * pos;
      const bl = size * 0.27;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(bl, y - bl * 0.55);
      ctx.moveTo(0, y);
      ctx.lineTo(-bl, y - bl * 0.55);
      ctx.stroke();
    });

    ctx.restore();
  }

  // centre dot
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(220,238,255,${opacity})`;
  ctx.fill();
}

// ─── Component ────────────────────────────────────────────────────────────────

function makeParticle(
  width: number,
  height: number,
  scattered: boolean,
  cfg: (typeof CFG)[Season],
): Particle {
  return {
    x: Math.random() * width,
    y: scattered ? Math.random() * height : -20 - Math.random() * 60,
    vx: (Math.random() - 0.5) * 0.8,
    vy: cfg.gyRange[0] + Math.random() * (cfg.gyRange[1] - cfg.gyRange[0]),
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.055,
    size: cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]),
    opacity: 0.6 + Math.random() * 0.35,
    swayPhase: Math.random() * Math.PI * 2,
    colorIdx: Math.floor(Math.random() * cfg.colors.length),
  };
}

export function SeasonalOverlay() {
  const { activeSeason } = useSeasonalContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Animation loop — re-runs when activeSeason changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!activeSeason) {
      cancelAnimationFrame(animRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const season: Season = activeSeason;
    const cfg = CFG[season];
    const { width, height } = canvas;

    particlesRef.current = Array.from({ length: cfg.count }, (_, i) =>
      makeParticle(width, height, i < cfg.count * 0.5, cfg),
    );

    let t = 0;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.012;

      for (const p of particlesRef.current) {
        const sway = Math.sin(t * 0.9 + p.swayPhase) * cfg.swayAmp;
        p.x += p.vx + sway * 0.04;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        if (p.y > canvas.height + 30)
          Object.assign(p, makeParticle(canvas.width, canvas.height, false, cfg));
        if (p.x < -30) p.x = canvas.width + 20;
        if (p.x > canvas.width + 30) p.x = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        const color = cfg.colors[p.colorIdx];
        if (season === "spring") drawPetal(ctx, p.size, color, p.opacity);
        else if (season === "summer") drawLeaf(ctx, p.size, color, p.opacity);
        else if (season === "autumn") drawAutumnLeaf(ctx, p.size, color, p.opacity);
        else drawSnowflake(ctx, p.size, p.opacity);

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animRef.current);
  }, [activeSeason]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none fixed inset-0 z-30 transition-opacity duration-700 ${
        activeSeason ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden
    />
  );
}
