"use client";

const C = {
  auto: "#3b82f6", // 자동 CI
  harbor: "#f59e0b", // 레지스트리
  manual: "#ec4899", // 수동 실행
  replica: "#10b981", // 실행 중 replica
  neutral: "#64748b", // 개발자 등 거치는 지점
};

function MonoLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground/70">
      {children}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <span className="text-base text-muted-foreground">↓</span>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
    </div>
  );
}

export function SwarmDeployFlowDiagram() {
  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Header + legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground">배포 흐름</span>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          {[
            { c: C.auto, t: "자동 (push 시 CI)" },
            { c: C.manual, t: "수동 (직접 실행)" },
            { c: C.replica, t: "실행 중 replica" },
          ].map((l) => (
            <span key={l.t} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: l.c }} />
              {l.t}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col p-5">
        {/* 개발자 */}
        <div
          className="rounded-xl border px-4 py-3 text-center"
          style={{ borderColor: C.neutral + "50", backgroundColor: C.neutral + "10" }}
        >
          <p className="text-xs font-semibold text-foreground/80">개발자</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            git push origin pandora/master
          </p>
        </div>

        <Arrow />

        {/* Track 1 — 자동 CI */}
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: C.auto + "50", backgroundColor: C.auto + "08" }}
        >
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: C.auto }}>
            GitLab CI · 배포 서버 (push 시 자동)
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { n: "① docker", d: "빌드 · Harbor push" },
              { n: "② deploy", d: "배포서버에 docker run" },
              { n: "③ cleanup", d: "옛 이미지 정리" },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-lg border p-2.5 text-center"
                style={{ borderColor: C.auto + "40", backgroundColor: C.auto + "10" }}
              >
                <p className="text-xs font-semibold" style={{ color: C.auto }}>
                  {s.n}
                </p>
                <p className="mt-1 text-[11px] text-foreground/70">{s.d}</p>
              </div>
            ))}
          </div>
        </div>

        <Arrow label="① docker 단계가 :latest push" />

        {/* Harbor */}
        <div
          className="rounded-xl border px-4 py-3 text-center"
          style={{ borderColor: C.harbor + "50", backgroundColor: C.harbor + "0d" }}
        >
          <p className="text-xs font-semibold" style={{ color: C.harbor }}>
            Harbor registry
          </p>
          <p className="mt-1 font-mono text-[11px] text-foreground/70">
            pandora-front:latest 갱신
          </p>
        </div>

        {/* 자동 / 수동 경계 */}
        <div className="my-2 flex items-center gap-3">
          <span className="h-px flex-1 border-t border-dashed border-border" />
          <span className="text-[10px] text-muted-foreground">여기까지 자동 · 아래부터 수동</span>
          <span className="h-px flex-1 border-t border-dashed border-border" />
        </div>

        {/* Track 2 — 수동 */}
        <div
          className="rounded-xl border px-4 py-3 text-center"
          style={{ borderColor: C.manual + "50", backgroundColor: C.manual + "0d" }}
        >
          <p className="text-xs font-semibold" style={{ color: C.manual }}>
            운영자 수동 실행 · manager 노드
          </p>
          <p className="mt-1 font-mono text-[11px] text-foreground/70">
            docker service update --image=...:latest --force
          </p>
        </div>

        <Arrow label="--force → 전 노드로 롤링 전파" />

        {/* Swarm rolling update */}
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: C.replica + "50", backgroundColor: C.replica + "08" }}
        >
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: C.replica }}>
            Swarm rolling update · 한 번에 1개씩 교체
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {["work02", "work03"].map((node) => (
              <div
                key={node}
                className="rounded-lg border p-2.5 text-center"
                style={{ borderColor: C.replica + "40", backgroundColor: C.replica + "10" }}
              >
                <p className="text-xs font-semibold" style={{ color: C.replica }}>
                  {node}
                </p>
                <MonoLine>:latest pull + 재시작</MonoLine>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            각 노드가 Harbor에서 :latest를 다시 받아 재기동
          </p>
        </div>
      </div>
    </div>
  );
}
