"use client";

const SERVER = "#3b82f6";
const CLIENT = "#f97316";

type Step = {
  id: string;
  side: "server" | "client";
  label: string;
  detail: string;
};

const steps: Step[] = [
  {
    id: "render",
    side: "server",
    label: "서버 컴포넌트 렌더",
    detail: "DB·API를 직접 호출해 컴포넌트를 서버에서 실행한다. 이 코드는 클라이언트 번들에 포함되지 않는다.",
  },
  {
    id: "payload",
    side: "server",
    label: "RSC Payload로 직렬화",
    detail: "결과를 HTML이 아닌 RSC Payload로 만든다. 클라이언트 컴포넌트 자리(placeholder)·JS 참조·props도 함께 담긴다.",
  },
  {
    id: "preview",
    side: "client",
    label: "HTML로 즉시 프리뷰",
    detail: "브라우저가 먼저 HTML로 정적 화면을 빠르게 보여준다. 아직 상호작용은 붙지 않은 상태.",
  },
  {
    id: "reconcile",
    side: "client",
    label: "RSC Payload로 트리 재구성",
    detail: "전달받은 RSC Payload로 서버/클라이언트 컴포넌트 트리를 맞춘다.",
  },
  {
    id: "hydrate",
    side: "client",
    label: "클라이언트 컴포넌트만 hydration",
    detail: "상호작용이 필요한 클라이언트 컴포넌트에만 이벤트 리스너를 붙인다. 서버 컴포넌트는 hydration되지 않는다.",
  },
];

export function RscRenderFlowDiagram() {
  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* legend */}
      <div className="flex items-center justify-center gap-4 border-b border-border py-2 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERVER }} />
          <span className="text-muted-foreground">서버에서</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLIENT }} />
          <span className="text-muted-foreground">브라우저에서</span>
        </span>
      </div>

      <div className="flex flex-col p-4">
        {steps.map((s, i) => {
          const color = s.side === "server" ? SERVER : CLIENT;
          return (
            <div key={s.id}>
              <div className="flex gap-3">
                {/* number + connector rail */}
                <div className="flex flex-none flex-col items-center">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white"
                    style={{ background: color }}
                  >
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && <span className="my-0.5 w-px flex-1" style={{ background: "hsl(var(--border))" }} />}
                </div>
                {/* content */}
                <div className={i < steps.length - 1 ? "pb-4" : ""}>
                  <div className="text-sm font-semibold text-foreground/85">{s.label}</div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{s.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
