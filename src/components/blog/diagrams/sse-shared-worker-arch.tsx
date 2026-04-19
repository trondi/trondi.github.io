"use client";

import { useState } from "react";

type ViewTab = "structure" | "flow";

// ── 코드 구조 레이어 ────────────────────────────────────────────────────────

const LAYERS = [
  {
    id: "ui",
    badge: "UI 레이어",
    label: "Components",
    connLabel: "useNotification(pageType)",
    borderColor: "#8b5cf6",
    bgColor: "#8b5cf608",
    textColor: "#a78bfa",
    items: ["Header  (pageType: 'ALL')", "HostTable  (pageType: 'HOST')", "CntrTable  (pageType: 'CNTR')"],
    desc: "각 컴포넌트가 pageType을 지정해 필요한 알람만 구독한다. ALL은 헤더 배지, HOST는 호스트 테이블, CNTR은 컨테이너 테이블.",
  },
  {
    id: "hook",
    badge: "훅",
    label: "useNotification(pageType)",
    connLabel: "getWorkerPort()  →  MessagePort",
    borderColor: "#6366f1",
    bgColor: "#6366f108",
    textColor: "#818cf8",
    items: ["ALARM_RECEIVED  →  UI 상태 업데이트", "UNREAD_STATUS_CHANGED  →  hasUnread", "markAsRead()  제공"],
    desc: "Worker 메시지를 React 상태로 변환. 컴포넌트와 Worker 사이의 인터페이스. cleanup 시 CLOSE 메시지 전송.",
  },
  {
    id: "client",
    badge: "브리지",
    label: "client.ts",
    connLabel: "port.postMessage  /  port.onmessage",
    borderColor: "#0ea5e9",
    bgColor: "#0ea5e908",
    textColor: "#38bdf8",
    items: ["new SharedWorker(worker.ts)", "REGISTER { pageType, baseURL } 전송", "MessagePort 반환"],
    desc: "SharedWorker 인스턴스를 생성하고 pageType을 등록하는 브리지. 호출마다 고유한 MessagePort를 반환한다.",
  },
  {
    id: "worker",
    badge: "SharedWorker",
    label: "worker.ts",
    connLabel: "new EventSource(url)",
    borderColor: "#10b981",
    bgColor: "#10b98108",
    textColor: "#34d399",
    items: ["connectedPorts[]  { port, pageType }", "lastReadNotiSeq  (읽음 상태 · 단일 진실 원천)", "alarmQueue[]  (이력 보관 · 새 탭 초기화용)"],
    desc: "단일 SSE 연결 유지. connectedPorts를 순회해 pageType에 맞는 알람만 전달. 읽음 상태를 Worker 메모리에 보관해 모든 탭이 동일한 기준을 공유한다.",
  },
  {
    id: "sse",
    badge: "SSE",
    label: "EventSource  →  서버",
    connLabel: "",
    borderColor: "#f59e0b",
    bgColor: "#f59e0b08",
    textColor: "#fbbf24",
    items: ["연결 1개  (탭 수 무관)", "지수 백오프 재연결  (최대 5회)", "withCredentials: true"],
    desc: "Worker가 단 하나의 EventSource를 유지. 탭이 몇 개 열려도 서버 SSE 연결은 1개. 연결 실패 시 지수 백오프로 재시도.",
  },
] as const;

// ── 메시지 흐름 스텝 ────────────────────────────────────────────────────────

const STEPS = [
  {
    label: "초기 상태",
    desc: "각 탭이 Worker에 pageType을 등록하고 대기 중. Worker는 단일 EventSource를 유지한다.",
    serverGlow: false,
    workerGlow: false,
    sseIn: false,
    toAll: false,
    toHost: false,
    cntrBlocked: false,
    fromAll: false,
    syncAll: false,
    note: "",
  },
  {
    label: "알람 수신",
    desc: "서버가 HOST 타입 알람을 SSE로 푸시. Worker의 EventSource.onmessage가 수신한다.",
    serverGlow: true,
    workerGlow: true,
    sseIn: true,
    toAll: false,
    toHost: false,
    cntrBlocked: false,
    fromAll: false,
    syncAll: false,
    note: "notiType: 'HOST'",
  },
  {
    label: "pageType 필터",
    desc: "Worker가 connectedPorts를 순회해 shouldSend를 평가. HOST 알람 → ALL·HOST 통과, CNTR 건너뜀.",
    serverGlow: false,
    workerGlow: true,
    sseIn: false,
    toAll: false,
    toHost: false,
    cntrBlocked: true,
    fromAll: false,
    syncAll: false,
    note: "ALL ✓  HOST ✓  CNTR ✗",
  },
  {
    label: "팬아웃",
    desc: "ALARM_RECEIVED를 ALL(헤더)·HOST(테이블) 탭에 전달. CNTR 탭은 이 알람을 수신하지 않는다.",
    serverGlow: false,
    workerGlow: true,
    sseIn: false,
    toAll: true,
    toHost: true,
    cntrBlocked: true,
    fromAll: false,
    syncAll: false,
    note: "ALARM_RECEIVED",
  },
  {
    label: "읽음 처리",
    desc: "사용자가 헤더에서 알람을 확인. MARK_AS_READ → Worker가 lastReadNotiSeq를 갱신한다.",
    serverGlow: false,
    workerGlow: true,
    sseIn: false,
    toAll: false,
    toHost: false,
    cntrBlocked: false,
    fromAll: true,
    syncAll: false,
    note: "MARK_AS_READ",
  },
  {
    label: "읽음 동기화",
    desc: "Worker가 ALL 타입 탭 전체에 UNREAD_STATUS_CHANGED(hasUnread: false)를 브로드캐스트. 모든 탭의 배지가 꺼진다.",
    serverGlow: false,
    workerGlow: true,
    sseIn: false,
    toAll: false,
    toHost: false,
    cntrBlocked: false,
    fromAll: false,
    syncAll: true,
    note: "UNREAD_STATUS_CHANGED",
  },
];

// ── 컴포넌트 ────────────────────────────────────────────────────────────────

export function SseSharedWorkerArchDiagram() {
  const [view, setView] = useState<ViewTab>("structure");
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const s = STEPS[step];

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* 탭 바 */}
      <div className="flex border-b border-border">
        {(["structure", "flow"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${
              view === id
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {id === "structure" ? "코드 구조" : "메시지 흐름"}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* ── 코드 구조 탭 ── */}
        {view === "structure" && (
          <div>
            <div className="space-y-0">
              {LAYERS.map((layer, i) => (
                <div key={layer.id}>
                  <button
                    className="w-full rounded-xl border px-4 py-3 text-left transition-all"
                    style={{
                      borderColor:
                        activeLayer === layer.id ? layer.borderColor : layer.borderColor + "60",
                      backgroundColor:
                        activeLayer === layer.id ? layer.bgColor : "transparent",
                    }}
                    onClick={() =>
                      setActiveLayer(activeLayer === layer.id ? null : layer.id)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          color: layer.textColor,
                          backgroundColor: layer.bgColor,
                          border: `1px solid ${layer.borderColor}`,
                        }}
                      >
                        {layer.badge}
                      </span>
                      <span
                        className="font-mono text-sm font-semibold"
                        style={{ color: layer.textColor }}
                      >
                        {layer.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {layer.items.map((item) => (
                        <span key={item} className="text-[11px] text-muted-foreground">
                          · {item}
                        </span>
                      ))}
                    </div>
                  </button>

                  {/* 레이어 간 커넥터 */}
                  {i < LAYERS.length - 1 && (
                    <div className="flex flex-col items-center py-0.5 select-none">
                      <span className="text-[10px] text-muted-foreground/40">↕</span>
                      {layer.connLabel && (
                        <span className="text-[10px] font-mono text-muted-foreground/40">
                          {layer.connLabel}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 설명 패널 */}
            <div className="mt-3 min-h-[48px] rounded-xl border border-border bg-background/50 px-4 py-3 text-xs text-foreground/70">
              {activeLayer
                ? LAYERS.find((l) => l.id === activeLayer)?.desc
                : <span className="text-muted-foreground/50">레이어를 클릭해 설명 보기</span>}
            </div>
          </div>
        )}

        {/* ── 메시지 흐름 탭 ── */}
        {view === "flow" && (
          <div>
            {/* 스텝 버튼 */}
            <div className="mb-4 flex flex-wrap gap-1">
              {STEPS.map((st, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    i === step
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {i === 0 ? "0. 초기" : `${i}. ${st.label}`}
                </button>
              ))}
            </div>

            {/* 비주얼 레이아웃 */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* 서버 */}
              <div
                className="flex flex-col items-center gap-1 rounded-xl border p-3 transition-all"
                style={{
                  borderColor: s.serverGlow ? "#f59e0b" : undefined,
                  backgroundColor: s.serverGlow ? "#f59e0b10" : undefined,
                  minWidth: 72,
                }}
              >
                <span className="text-2xl">🖥️</span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: s.serverGlow ? "#fbbf24" : undefined }}
                >
                  서버
                </span>
                <span className="text-[10px] text-muted-foreground">SSE push</span>
              </div>

              {/* SSE 화살표 */}
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="text-sm font-bold transition-colors"
                  style={{ color: s.sseIn ? "#f59e0b" : "hsl(var(--muted-foreground) / 0.2)" }}
                >
                  {s.sseIn ? "──→" : "─ ─"}
                </span>
                <span
                  className="text-[10px] font-mono transition-colors"
                  style={{ color: s.sseIn ? "#f59e0b" : "transparent" }}
                >
                  EventSource
                </span>
              </div>

              {/* Worker */}
              <div
                className="flex flex-col gap-1.5 rounded-xl border px-4 py-3 transition-all"
                style={{
                  borderColor: s.workerGlow ? "#10b981" : undefined,
                  backgroundColor: s.workerGlow ? "#10b98110" : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚙️</span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: s.workerGlow ? "#34d399" : undefined }}
                  >
                    Shared Worker
                  </span>
                </div>
                <div className="space-y-0.5">
                  {["connectedPorts[]", "lastReadNotiSeq", "alarmQueue[]"].map((item) => (
                    <div key={item} className="font-mono text-[10px] text-muted-foreground/50">
                      {item}
                    </div>
                  ))}
                </div>
                {s.note && (
                  <div
                    className="rounded px-2 py-0.5 text-center text-[10px] font-semibold"
                    style={{
                      color: s.cntrBlocked && !s.toAll ? "#facc15" : "#34d399",
                      backgroundColor: s.cntrBlocked && !s.toAll ? "#facc1510" : "#10b98110",
                    }}
                  >
                    {s.note}
                  </div>
                )}
              </div>

              {/* 화살표 + 탭 열 */}
              <div className="flex flex-col gap-2">
                {/* ALL 탭 */}
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 text-right text-sm font-bold transition-colors"
                    style={{
                      color: s.toAll
                        ? "#34d399"
                        : s.fromAll
                        ? "#818cf8"
                        : s.syncAll
                        ? "#34d399"
                        : "hsl(var(--muted-foreground) / 0.2)",
                    }}
                  >
                    {s.fromAll ? "←─" : "─→"}
                  </span>
                  <div
                    className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-all"
                    style={{
                      borderColor:
                        s.toAll || s.fromAll || s.syncAll ? "#6366f1" : undefined,
                      backgroundColor:
                        s.toAll || s.fromAll || s.syncAll ? "#6366f110" : undefined,
                      minWidth: 140,
                    }}
                  >
                    <span className="text-base">🔔</span>
                    <div>
                      <div
                        className="text-xs font-semibold"
                        style={{
                          color:
                            s.toAll || s.fromAll || s.syncAll ? "#818cf8" : undefined,
                        }}
                      >
                        헤더 탭
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground/50">
                        pageType: ALL
                      </div>
                    </div>
                  </div>
                </div>

                {/* HOST 탭 */}
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 text-right text-sm font-bold transition-colors"
                    style={{
                      color: s.toHost
                        ? "#34d399"
                        : "hsl(var(--muted-foreground) / 0.2)",
                    }}
                  >
                    ─→
                  </span>
                  <div
                    className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-all"
                    style={{
                      borderColor: s.toHost ? "#0ea5e9" : undefined,
                      backgroundColor: s.toHost ? "#0ea5e910" : undefined,
                      minWidth: 140,
                    }}
                  >
                    <span className="text-base">📊</span>
                    <div>
                      <div
                        className="text-xs font-semibold"
                        style={{ color: s.toHost ? "#38bdf8" : undefined }}
                      >
                        호스트 탭
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground/50">
                        pageType: HOST
                      </div>
                    </div>
                  </div>
                </div>

                {/* CNTR 탭 */}
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 text-right text-sm font-bold transition-colors"
                    style={{
                      color: s.cntrBlocked
                        ? "#f87171"
                        : "hsl(var(--muted-foreground) / 0.2)",
                    }}
                  >
                    {s.cntrBlocked ? "─✗" : "─→"}
                  </span>
                  <div
                    className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-all"
                    style={{
                      borderColor: s.cntrBlocked ? "#f8717130" : undefined,
                      backgroundColor: s.cntrBlocked ? "#f8717108" : undefined,
                      opacity: s.cntrBlocked ? 0.5 : 1,
                      minWidth: 140,
                    }}
                  >
                    <span className="text-base">📦</span>
                    <div>
                      <div
                        className="text-xs font-semibold"
                        style={{ color: s.cntrBlocked ? "#f87171" : undefined }}
                      >
                        컨테이너 탭
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground/50">
                        pageType: CNTR
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 설명 */}
            <div className="mt-4 rounded-xl border border-border bg-background/50 px-4 py-3 text-xs text-foreground/70">
              {s.desc}
            </div>

            {/* 이전 / 다음 */}
            <div className="mt-3 flex justify-between">
              <button
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/80 disabled:opacity-30"
              >
                ← 이전
              </button>
              <button
                onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
                disabled={step === STEPS.length - 1}
                className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/80 disabled:opacity-30"
              >
                다음 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
