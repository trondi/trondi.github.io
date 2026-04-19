"use client";

import { useState } from "react";

type ObjectInfo = {
  label: string;
  color: string;
  icon: string;
  role: string;
  yaml: string;
};

const objects: ObjectInfo[] = [
  {
    label: "Pod",
    color: "#6366f1",
    icon: "📦",
    role: "컨테이너 실행 최소 단위. 같은 Pod의 컨테이너는 localhost로 통신.",
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  containers:
    - name: app
      image: my-app:1.0
      ports:
        - containerPort: 3000`,
  },
  {
    label: "Deployment",
    color: "#8b5cf6",
    icon: "🚀",
    role: "Pod를 선언적으로 관리. replicas 수 유지 + 롤링 업데이트 처리.",
    yaml: `apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0`,
  },
  {
    label: "Service",
    color: "#10b981",
    icon: "🔗",
    role: "Pod IP가 바뀌어도 고정 엔드포인트 제공. 레이블 셀렉터로 Pod 묶음.",
    yaml: `apiVersion: v1
kind: Service
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP`,
  },
  {
    label: "Ingress",
    color: "#f59e0b",
    icon: "🌐",
    role: "외부 HTTP/HTTPS 트래픽을 도메인·경로 기반으로 내부 Service에 라우팅.",
    yaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            backend:
              service:
                name: my-app-svc
                port:
                  number: 80`,
  },
  {
    label: "HPA",
    color: "#ec4899",
    icon: "⚖️",
    role: "CPU·메모리 사용률에 따라 Pod 수를 자동으로 조절 (Scale Out/In).",
    yaml: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: 70`,
  },
];

export function KubernetesClusterDiagram() {
  const [tab, setTab] = useState<"cluster" | "objects">("cluster");
  const [selected, setSelected] = useState<ObjectInfo | null>(null);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {(["cluster", "objects"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${
              tab === t
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "cluster" ? "클러스터 구조" : "오브젝트 계층"}
          </button>
        ))}
      </div>

      {tab === "cluster" && (
        <div className="p-5">
          {/* Cluster box */}
          <div className="rounded-xl border border-dashed border-border p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cluster</p>
            <div className="grid gap-3 md:grid-cols-2">
              {/* Control Plane */}
              <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500">Control Plane</p>
                {["API Server", "Scheduler", "Controller Manager", "etcd"].map((item) => (
                  <div key={item} className="mt-1 flex items-center gap-2 rounded-md bg-background/60 px-2 py-1 text-xs text-foreground/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    {item}
                  </div>
                ))}
              </div>
              {/* Worker Nodes */}
              <div className="space-y-2">
                {["Worker Node 1", "Worker Node 2"].map((node, ni) => (
                  <div key={node} className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500">{node}</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: ni === 0 ? 3 : 2 }).map((_, i) => (
                        <div key={i} className="flex h-8 w-12 items-center justify-center rounded border border-border bg-background/60 text-[10px] font-semibold text-foreground/60">
                          Pod
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Traffic flow */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            {["사용자", "→", "Ingress", "→", "Service", "→", "Pod"].map((item, i) => (
              <span key={i} className={item === "→" ? "text-border" : "rounded-md border border-border bg-background/60 px-2 py-1 font-medium text-foreground/70"}>
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {tab === "objects" && (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {objects.map((obj) => (
              <button
                key={obj.label}
                onClick={() => setSelected(selected?.label === obj.label ? null : obj)}
                className="flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all hover:scale-[1.02]"
                style={{
                  borderColor: selected?.label === obj.label ? obj.color : undefined,
                  backgroundColor: selected?.label === obj.label ? obj.color + "15" : undefined,
                }}
              >
                <span className="text-2xl">{obj.icon}</span>
                <span className="text-xs font-bold" style={{ color: obj.color }}>{obj.label}</span>
              </button>
            ))}
          </div>

          {/* Hierarchy arrow */}
          <div className="my-4 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            {objects.slice(0, 4).map((obj, i) => (
              <>
                <span key={obj.label} className="rounded px-2 py-0.5 font-semibold" style={{ color: obj.color }}>
                  {obj.label}
                </span>
                {i < 3 && <span key={`arrow-${i}`} className="text-border">→</span>}
              </>
            ))}
          </div>

          {selected && (
            <div className="rounded-xl border p-4 transition-all" style={{ borderColor: selected.color + "50", backgroundColor: selected.color + "08" }}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xl">{selected.icon}</span>
                <span className="font-bold" style={{ color: selected.color }}>{selected.label}</span>
              </div>
              <p className="mb-3 text-xs leading-5 text-foreground/70">{selected.role}</p>
              <pre className="overflow-x-auto rounded-lg bg-background/80 p-3 text-[11px] leading-5 text-foreground/80">
                <code>{selected.yaml}</code>
              </pre>
            </div>
          )}
          {!selected && (
            <p className="mt-2 text-center text-xs text-muted-foreground">오브젝트를 클릭하면 역할과 YAML을 확인할 수 있습니다</p>
          )}
        </div>
      )}
    </div>
  );
}
