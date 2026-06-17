"use client";

import { useState } from "react";

type Tab = "env" | "envFrom" | "volume";

// secretKeyRef(env) 방식의 세 가지 이름 매칭
const envMatches = [
  { n: "1", color: "#8b5cf6", label: "secretKeyRef.name ↔ Secret metadata.name", desc: "어느 Secret 객체에서" },
  { n: "2", color: "#10b981", label: "key ↔ Secret data의 키", desc: "그 안의 어느 값을" },
  { n: "3", color: "#64748b", label: "env.name → 컨테이너 환경변수 이름", desc: "뭐라고 부를지 (자유)" },
];

export function K8sSecretInjectionDiagram() {
  const [tab, setTab] = useState<Tab>("env");

  const tabs: { id: Tab; label: string }[] = [
    { id: "env", label: "env (키 하나씩)" },
    { id: "envFrom", label: "envFrom (전체)" },
    { id: "volume", label: "volume (파일)" },
  ];

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
              tab === t.id
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 공통: Secret 객체 → Pod spec → 컨테이너 흐름 */}
      <div className="p-5">
        {/* Secret 객체 */}
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
              Secret 객체
            </span>
            <span className="text-[10px] text-muted-foreground">클러스터 etcd에 저장 · .env 파일 아님</span>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-foreground/70">
            <div>metadata.name: db-credentials</div>
            <div>data: password: c3VwZXJzZWNyZXQ=</div>
          </div>
        </div>

        <div className="flex items-center justify-center py-1.5 text-[11px] text-muted-foreground">
          ↓ 참조 (lookup)
        </div>

        {/* Pod spec — 탭별 */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              Pod spec
            </span>
            <span className="text-[10px] text-muted-foreground">내가 작성하는 매니페스트</span>
          </div>
          <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-5 text-foreground/70">
{tab === "env" &&
`env:
  - name: DB_PASSWORD       # 3
    valueFrom:
      secretKeyRef:
        name: db-credentials  # 1
        key:  password        # 2`}
{tab === "envFrom" &&
`envFrom:
  - secretRef:
      name: db-credentials
# Secret의 모든 키가 환경변수로`}
{tab === "volume" &&
`volumes:
  - name: secret
    secret:
      secretName: db-credentials
volumeMounts:
  - mountPath: /etc/secret`}
          </pre>
        </div>

        <div className="flex items-center justify-center py-1.5 text-[11px] text-muted-foreground">
          ↓ 주입 (inject)
        </div>

        {/* 컨테이너 런타임 — 탭별 결과 */}
        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              컨테이너 런타임
            </span>
            <span className="text-[10px] text-muted-foreground">앱은 출처를 모름</span>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-foreground/70">
            {tab === "env" && <div>$DB_PASSWORD = supersecret</div>}
            {tab === "envFrom" && <div>$password = supersecret (+ 모든 키)</div>}
            {tab === "volume" && <div>/etc/secret/password (파일, tmpfs)</div>}
          </div>
        </div>

        {/* env 탭에서만: 이름 매칭 설명 */}
        {tab === "env" && (
          <div className="mt-4 space-y-2">
            {envMatches.map((m) => (
              <div key={m.n} className="flex items-start gap-2">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {m.n}
                </span>
                <div className="text-[11px] leading-4">
                  <span className="font-mono text-foreground/80">{m.label}</span>
                  <span className="ml-1.5 text-muted-foreground">— {m.desc}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "envFrom" && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-foreground/70">
            💡 <strong>.env 파일을 통째로 로드</strong>하는 느낌과 가장 비슷합니다. 단, 파일이 아니라
            Secret 객체에서 모든 키가 환경변수로 들어옵니다. 새 키가 추가되면 의도치 않게 주입될 수 있어
            디버깅 측면에선 <code className="text-amber-400">secretKeyRef</code>가 안전합니다.
          </div>
        )}

        {tab === "volume" && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-foreground/70">
            💡 키마다 <strong>파일 하나</strong>로 마운트됩니다. 노드 디스크가 아닌
            <strong> tmpfs(메모리)</strong>에 올라가며, 시크릿을 바꾸면 파일이 자동 갱신돼
            <strong> 무중단 교체</strong>가 가능합니다.
          </div>
        )}
      </div>
    </div>
  );
}
