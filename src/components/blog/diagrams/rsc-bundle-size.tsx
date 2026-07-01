"use client";

const SERVER = "#3b82f6";
const CLIENT = "#f97316";

type Bar = {
  label: string;
  sublabel: string;
  color: string;
  kb: number; // 클라이언트 번들 기여량
  caption: string;
};

const bars: Bar[] = [
  {
    label: "클라이언트 컴포넌트",
    sublabel: "'use client' + import date-fns",
    color: CLIENT,
    kb: 70,
    caption: "date-fns가 통째로 클라이언트 번들에 포함된다",
  },
  {
    label: "서버 컴포넌트",
    sublabel: "동일한 date-fns 사용",
    color: SERVER,
    kb: 0,
    caption: "서버에서만 실행 → 클라이언트 번들 기여 0KB",
  },
];

const MAX = 70;

export function RscBundleSizeDiagram() {
  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20 p-4">
      <p className="mb-4 text-center text-[11px] text-muted-foreground">
        같은 <code className="rounded bg-background/60 px-1">date-fns</code>를 써도, 어디서 실행하느냐에 따라 클라이언트 번들 기여량이 다르다
      </p>

      <div className="flex flex-col gap-4">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold" style={{ color: b.color }}>
                {b.label}
              </span>
              <span className="font-mono text-sm font-bold" style={{ color: b.color }}>
                +{b.kb}KB
              </span>
            </div>
            <div className="mb-1 text-[11px] text-muted-foreground">
              <code className="rounded bg-background/60 px-1">{b.sublabel}</code>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-md bg-background/50">
              <div
                className="flex h-full items-center rounded-md transition-all"
                style={{
                  width: `${Math.max((b.kb / MAX) * 100, b.kb === 0 ? 0 : 4)}%`,
                  background: b.color,
                  minWidth: b.kb === 0 ? 0 : undefined,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{b.caption}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
