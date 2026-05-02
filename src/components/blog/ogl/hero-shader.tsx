"use client";

import { useEffect, useRef } from "react";

const VERT = /* glsl */ `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec2  uMouse;
  uniform int   uDark;

  float wave(vec2 p, float t) {
    return sin(p.x * 2.8 + t)              * 0.35
         + sin(p.y * 3.2 - t * 0.7)        * 0.30
         + sin((p.x + p.y) * 2.1 + t * 1.1)* 0.20
         + sin(length(p - 0.5) * 5.0 - t * 0.9) * 0.15;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float t  = uTime * 0.26;

    vec2 mouse = uMouse / uResolution;
    uv += (mouse - 0.5) * 0.04;

    float n = wave(uv, t) * 0.5 + 0.5;

    vec3 amber  = vec3(0.784, 0.518, 0.353);
    vec3 sienna = vec3(0.620, 0.345, 0.173);
    vec3 ochre  = vec3(0.878, 0.655, 0.400);

    vec3 color = mix(amber, sienna, n);
    color = mix(color, ochre, sin(uv.x * 3.0 + t * 0.6) * 0.5 + 0.5);

    float alpha = uDark == 1
      ? n * 0.14 + 0.04
      : n * 0.07 + 0.02;

    alpha *= smoothstep(1.0, 0.3, uv.y);

    gl_FragColor = vec4(color, alpha);
  }
`;

export function HeroShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
    if (!gl) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

    const uTime = gl.getUniformLocation(prog, "uTime");
    const uResolution = gl.getUniformLocation(prog, "uResolution");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uDark = gl.getUniformLocation(prog, "uDark");

    let mx = 0;
    let my = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    function resize() {
      const { offsetWidth: w, offsetHeight: h } = canvas!.parentElement!;
      canvas!.width = w;
      canvas!.height = h;
      gl!.viewport(0, 0, w, h);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    let dark = document.documentElement.classList.contains("dark") ? 1 : 0;
    const mo = new MutationObserver(() => {
      dark = document.documentElement.classList.contains("dark") ? 1 : 0;
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

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
