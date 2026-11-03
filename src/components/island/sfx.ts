/**
 * 섬 효과음 — 발소리, 나무 흔들기, 줍기, 낚시, 버튼·창 소리, 주민 말소리.
 * 녹음된 소리는 public/island/sfx (출처·라이선스는 그 폴더의 LICENSE.txt, 모두 CC0),
 * 주민 말소리와 문 두드리는 소리는 Web Audio로 그때그때 만든다.
 * 배경음악과 같은 AudioContext를 쓰고, 소리 켜기/끄기도 함께 따른다.
 */

const FILES = {
  step: ["step1", "step2", "step3", "step4", "step5", "step6"],
  rustle: ["rustle1", "rustle2"],
  drop: ["drop"],
  pickup: ["pickup"],
  plant: ["plant"],
  plop: ["plop"],
  splash: ["splash"],
  "splash-big": ["splash-big"],
  jingle: ["jingle"],
  click: ["click"],
  open: ["open"],
  close: ["close"],
  toggle: ["toggle"],
  pages: ["pages"],
  paper: ["paper"],
  bag: ["bag"],
  pop: ["pop"],
} as const;

export type SfxName = keyof typeof FILES;

/** 소리마다 크기와 재생 속도 흔들림(같은 소리가 기계적으로 들리지 않게) */
const MIX: Record<SfxName, { gain: number; vary: number }> = {
  step: { gain: 0.16, vary: 0.12 },
  rustle: { gain: 0.5, vary: 0.1 },
  drop: { gain: 0.35, vary: 0.15 },
  pickup: { gain: 0.35, vary: 0.08 },
  plant: { gain: 0.9, vary: 0.1 },
  plop: { gain: 0.3, vary: 0.15 },
  splash: { gain: 0.35, vary: 0.1 },
  "splash-big": { gain: 0.35, vary: 0.05 },
  jingle: { gain: 0.3, vary: 0 },
  click: { gain: 0.25, vary: 0.05 },
  open: { gain: 0.25, vary: 0.03 },
  close: { gain: 0.22, vary: 0.03 },
  toggle: { gain: 0.25, vary: 0 },
  pages: { gain: 0.35, vary: 0.05 },
  paper: { gain: 0.4, vary: 0.05 },
  bag: { gain: 0.35, vary: 0.05 },
  pop: { gain: 0.3, vary: 0.1 },
};

export type Sfx = {
  /** 배경음악이 사용자 조작 안에서 만든 AudioContext를 받아 소리를 불러 둔다 */
  attach: (ctx: AudioContext) => void;
  setOn: (on: boolean) => void;
  play: (name: SfxName, opts?: { rate?: number; gain?: number }) => void;
  /** 주민 말소리 — 글자 수만큼 짧게 "삐빅" (voice: 0~1, 주민마다 다른 목소리 높이) */
  babble: (text: string, voice: number) => void;
  /** 문 두드리는 소리 (똑똑) */
  knock: () => void;
};

export function createSfx(initialOn: boolean): Sfx {
  let ctx: AudioContext | null = null;
  let out: GainNode | null = null;
  let on = initialOn;
  const buffers = new Map<string, AudioBuffer>();
  let babbleUntil = 0;

  const load = async (c: AudioContext, file: string) => {
    try {
      const res = await fetch(`/island/sfx/${file}.mp3`);
      buffers.set(file, await c.decodeAudioData(await res.arrayBuffer()));
    } catch {
      // 못 불러온 소리는 조용히 건너뛴다
    }
  };

  const ready = () => (on && ctx && out && ctx.state === "running" ? { c: ctx, o: out } : null);

  return {
    attach(c) {
      if (ctx) return;
      ctx = c;
      out = c.createGain();
      out.gain.value = 1;
      out.connect(c.destination);
      for (const list of Object.values(FILES)) for (const f of list) void load(c, f);
    },
    setOn(next) {
      on = next;
    },
    play(name, opts) {
      const r = ready();
      if (!r) return;
      const list = FILES[name];
      const buf = buffers.get(list[Math.floor(Math.random() * list.length)]);
      if (!buf) return;
      const mix = MIX[name];
      const src = r.c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (opts?.rate ?? 1) * (1 + (Math.random() * 2 - 1) * mix.vary);
      const g = r.c.createGain();
      g.gain.value = mix.gain * (opts?.gain ?? 1);
      src.connect(g).connect(r.o);
      src.start();
    },
    babble(text, voice) {
      const r = ready();
      if (!r) return;
      const { c, o } = r;
      // 글자(공백·문장부호 제외)마다 한 소리, 너무 길면 앞부분만
      const chars = [...text].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).slice(0, 18);
      if (!chars.length) return;
      // 앞 말소리가 끝나기 전에 새 말이 시작되면 겹치지 않게 그 뒤로
      let t = Math.max(c.currentTime + 0.02, babbleUntil);
      const base = 300 + voice * 260;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      lp.connect(o);
      chars.forEach((ch, i) => {
        const code = ch.codePointAt(0) ?? 0;
        // 글자에 따라 음 높이가 조금씩 달라진다 (같은 글자는 같은 소리)
        const f = base * (0.85 + ((code * 7) % 11) / 30) * (i === chars.length - 1 ? 0.92 : 1);
        const osc = c.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 1.08, t + 0.05);
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(g).connect(lp);
        osc.start(t);
        osc.stop(t + 0.07);
        t += 0.075;
      });
      babbleUntil = t;
    },
    knock() {
      const r = ready();
      if (!r) return;
      const { c, o } = r;
      for (const dt of [0, 0.17]) {
        const t = c.currentTime + 0.02 + dt;
        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(190, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(g).connect(o);
        osc.start(t);
        osc.stop(t + 0.14);
      }
    },
  };
}
