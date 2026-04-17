"use client";

import { useEffect, useRef } from "react";

/* ─── GLSL ──────────────────────────────────────────────────────────────────── */

const VERT = /* glsl */ `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Flowing aurora-style gradient — indigo / violet / sky palette
const FRAG = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec2  uMouse;
  uniform int   uDark;

  // Cheap smooth noise via layered sines
  float wave(vec2 p, float t) {
    return sin(p.x * 2.8 + t)       * 0.35
         + sin(p.y * 3.2 - t * 0.7) * 0.30
         + sin((p.x + p.y) * 2.1 + t * 1.1) * 0.20
         + sin(length(p - 0.5) * 5.0 - t * 0.9) * 0.15;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float t  = uTime * 0.28;

    // Subtle mouse pull
    vec2 mouse = uMouse / uResolution;
    uv += (mouse - 0.5) * 0.04;

    float n = wave(uv, t) * 0.5 + 0.5;

    // Palette — indigo (#4338CA) / violet (#7C3AED) / sky (#0EA5E9)
    vec3 indigo = vec3(0.263, 0.220, 0.792);
    vec3 violet = vec3(0.486, 0.227, 0.929);
    vec3 sky    = vec3(0.055, 0.647, 0.914);

    vec3 color = mix(indigo, violet, n);
    color = mix(color, sky, sin(uv.x * 3.0 + t * 0.6) * 0.5 + 0.5);

    // Dark mode: slightly stronger glow; light mode: very subtle
    float alpha = uDark == 1
      ? n * 0.13 + 0.04
      : n * 0.06 + 0.02;

    // Fade out toward bottom
    alpha *= smoothstep(1.0, 0.3, uv.y);

    gl_FragColor = vec4(color, alpha);
  }
`;

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function HeroShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── WebGL setup (raw, no library needed for this simple 2-triangle quad) ──
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
    if (!gl) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Compile shaders
    function compile(type: number, src: string) {
      const sh = gl!.createShader(type)!;
      gl!.shaderSource(sh, src);
      gl!.compileShader(sh);
      return sh;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Full-screen triangle (3 verts → covers clip space)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uTime       = gl.getUniformLocation(prog, "uTime");
    const uResolution = gl.getUniformLocation(prog, "uResolution");
    const uMouse      = gl.getUniformLocation(prog, "uMouse");
    const uDark       = gl.getUniformLocation(prog, "uDark");

    // Mouse tracking
    let mx = 0, my = 0;
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener("mousemove", onMove, { passive: true });

    // Resize
    function resize() {
      const { offsetWidth: w, offsetHeight: h } = canvas!.parentElement!;
      canvas!.width  = w;
      canvas!.height = h;
      gl!.viewport(0, 0, w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    // Dark-mode observer
    let dark = document.documentElement.classList.contains("dark") ? 1 : 0;
    const mo = new MutationObserver(() => {
      dark = document.documentElement.classList.contains("dark") ? 1 : 0;
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // Render loop
    let raf: number;
    let start: number | null = null;
    function tick(ts: number) {
      if (!start) start = ts;
      const t = (ts - start) * 0.001;

      gl!.uniform1f(uTime, t);
      gl!.uniform2f(uResolution, canvas!.width, canvas!.height);
      gl!.uniform2f(uMouse, mx, canvas!.height - my);
      gl!.uniform1i(uDark, dark);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      ro.disconnect();
      mo.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
