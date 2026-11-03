/**
 * 섬 배경음악 — 낮(6시~18시)과 밤(18시~6시)에 따라 곡 목록을 바꿔 무작위로 이어 튼다.
 * 곡이 끝나면 같은 목록에서 다음 곡을 고르고, 낮↔밤이 바뀌면 천천히 넘어간다.
 * 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 낼 수 없으므로 unlock()으로 시작한다.
 * 볼륨은 Web Audio의 GainNode로 조절한다 — iOS Safari는 audio.volume을 바꿀 수 없다.
 * 곡 출처와 라이선스(CC0)는 public/island/audio/LICENSE.txt
 */

const DAY = ["/island/audio/day-a-small-fire-will-do.mp3", "/island/audio/day-etirwer.mp3"];
const NIGHT = [
  "/island/audio/night-poor-but-happy.mp3",
  "/island/audio/night-blue-skies.mp3",
  "/island/audio/night-letting-go-of-the-past.mp3",
  "/island/audio/night-puppy-love.mp3",
  "/island/audio/night-clouds.mp3",
  "/island/audio/night-happy-but-a-little-off.mp3",
  "/island/audio/night-new-shoes.mp3",
];

const VOLUME = 0.35;
const FADE_MS = 1800;
const STORAGE_KEY = "island-sound";

export type Period = "day" | "night";
export const periodAt = (d: Date): Period => (d.getHours() >= 6 && d.getHours() < 18 ? "day" : "night");

/** 소리 켜짐 여부 — 처음 오면 켜져 있다 */
export function loadSoundOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}
function storeSoundOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // 저장이 막혀 있어도 이번 방문 동안은 동작한다
  }
}

export type Bgm = {
  /** 사용자 조작(클릭·키 입력) 안에서 불러야 재생이 허용된다 */
  unlock: () => void;
  setOn: (on: boolean) => void;
  /** 시계가 바뀔 때마다 — 낮↔밤이 바뀌었으면 목록을 바꾼다 */
  tick: (now: Date) => void;
  dispose: () => void;
};

export function createBgm(initialOn: boolean): Bgm {
  const audio = new Audio();
  audio.preload = "none";
  audio.volume = 0;
  let on = initialOn;
  let unlocked = false;
  let period: Period = periodAt(new Date());
  let current: string | null = null;
  let fade = 0;
  let fadeDone = 0;
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;
  const getVol = () => (gain ? gain.gain.value : audio.volume);
  const setVol = (v: number) => {
    if (gain && ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(v, ctx.currentTime);
    } else audio.volume = v;
  };
  // 사용자 조작 안에서 Web Audio를 연결한다 (안 되면 audio.volume으로 조절)
  const connectGain = () => {
    if (ctx) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
      audio.volume = 1;
      void ctx.resume();
    } catch {
      ctx = null;
      gain = null;
    }
  };

  const pick = (list: string[]) => {
    // 곡이 셋 이상이면 방금 곡은 바로 다시 고르지 않는다
    const pool = list.length > 2 && current ? list.filter((s) => s !== current) : list;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // 볼륨을 FADE_MS 동안 target까지 바꾼다 — 새 페이드가 오면 이전 페이드(와 그 뒤 할 일)는 취소된다
  const rampTo = (target: number, done?: () => void) => {
    cancelAnimationFrame(fade);
    window.clearTimeout(fadeDone);
    if (gain && ctx) {
      const g = gain.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(target, t + FADE_MS / 1000);
    } else {
      const from = getVol();
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / FADE_MS);
        setVol(from + (target - from) * k);
        if (k < 1) fade = requestAnimationFrame(step);
      };
      fade = requestAnimationFrame(step);
    }
    if (done) fadeDone = window.setTimeout(done, FADE_MS);
  };

  const playNext = () => {
    current = pick(period === "day" ? DAY : NIGHT);
    audio.src = current;
    setVol(0);
    audio.play().then(() => rampTo(VOLUME)).catch(() => {
      // 자동 재생이 막히면 다음 사용자 조작(unlock)에서 다시 시도한다
      unlocked = false;
    });
  };

  const onEnded = () => {
    if (on && unlocked) playNext();
  };
  audio.addEventListener("ended", onEnded);

  // 탭을 가리면 멈추고, 돌아오면 이어서 튼다
  const onVisibility = () => {
    if (!on || !unlocked || !current) return;
    if (document.hidden) audio.pause();
    else {
      void ctx?.resume();
      audio.play().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const start = () => {
    if (!on || !unlocked) return;
    if (!current) return playNext();
    // 끄는 중(페이드 아웃)에 다시 켜도 그 자리에서 다시 커진다
    if (audio.paused) audio.play().then(() => rampTo(VOLUME)).catch(() => {});
    else rampTo(VOLUME);
  };

  return {
    unlock() {
      if (unlocked) return;
      unlocked = true;
      connectGain();
      start();
    },
    setOn(next) {
      on = next;
      storeSoundOn(next);
      if (next) start();
      else rampTo(0, () => audio.pause());
    },
    tick(now) {
      const p = periodAt(now);
      if (p === period) return;
      period = p;
      if (!on || !unlocked || !current) {
        current = null;
        return;
      }
      rampTo(0, playNext);
    },
    dispose() {
      cancelAnimationFrame(fade);
      window.clearTimeout(fadeDone);
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibility);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      void ctx?.close();
    },
  };
}
