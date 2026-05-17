"use client";

export function AlarmDataFlowDiagram() {
  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        SSE 알람 → 테이블 업데이트 전체 흐름
      </div>

      <div className="p-5">
        {/* Row 1: SSE → SharedWorker */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3">
            <span className="text-xl">🖥️</span>
            <span className="text-xs font-bold text-emerald-400">SSE 서버</span>
          </div>
          <Arrow />
          <div className="flex flex-col items-center gap-1 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-5 py-3">
            <span className="text-xl">⚙️</span>
            <span className="text-xs font-bold text-indigo-400">SharedWorker</span>
            <span className="text-[10px] text-muted-foreground">SSE 연결 1개 유지</span>
          </div>
          <Arrow />
          <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              MessagePort
            </div>
            <div className="mt-1 font-mono text-[10px] text-foreground/70">ALARM_RECEIVED</div>
          </div>
        </div>

        <DownArrow />

        {/* Row 2: Three useAlarmHandler instances */}
        <div className="flex items-start justify-center gap-3">
          <HandlerBox
            label="useAlarmHandler"
            badge="HOST"
            badgeColor="text-orange-400 border-orange-500/40 bg-orange-500/10"
            desc="HOST + CNTR 수신"
            component="HostTable / HostExpandRow"
          />
          <HandlerBox
            label="useAlarmHandler"
            badge="CNTR"
            badgeColor="text-sky-400 border-sky-500/40 bg-sky-500/10"
            desc="CNTR만 수신"
            component="CntrTable"
          />
          <HandlerBox
            label="useAlarmHandler"
            badge="ALL"
            badgeColor="text-slate-400 border-slate-500/40 bg-slate-500/10"
            desc="전체 수신"
            component="Header / NotiTable"
          />
        </div>

        <DownArrow />

        {/* Row 3: pendingQueue */}
        <div className="flex justify-center">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-6 py-3 text-center">
            <div className="text-xs font-bold text-amber-400">pendingQueue</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              {'Map<"cntr-id-hostId" | "host-hostId", AlarmInfo>'}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              같은 대상 알람은 최신 1개만 유지
            </div>
          </div>
        </div>

        <DownArrow />

        {/* Row 4: getUpdateStrategy */}
        <div className="flex justify-center">
          <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-6 py-3 text-center">
            <div className="text-xs font-bold text-violet-400">getUpdateStrategy()</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              currentPageIds 필터링 → 전략 결정
            </div>
          </div>
        </div>

        <DownArrow />

        {/* Row 5: FULL_REFRESH / ROW_UPDATE / NONE */}
        <div className="flex items-start justify-center gap-4">
          {/* FULL_REFRESH */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center">
              <div className="text-xs font-bold text-red-400">FULL_REFRESH</div>
              <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                <div>HOST: CRT / DEL</div>
                <div>CNTR: create / destroy…</div>
                <div>큐 ≥ threshold(8)</div>
              </div>
            </div>
            <DownArrowSmall />
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
              <div className="text-[10px] font-semibold text-red-300">refetch()</div>
              <div className="text-[10px] text-muted-foreground">전체 재조회</div>
            </div>
          </div>

          {/* ROW_UPDATE */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center">
              <div className="text-xs font-bold text-emerald-400">ROW_UPDATE</div>
              <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                <div>상태 변화 알람</div>
                <div>THROTTLE 5s 후 실행</div>
              </div>
            </div>
            <DownArrowSmall />
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center">
              <div className="text-[10px] font-semibold text-emerald-300">executePartialUpdateLogic()</div>
              <div className="mt-1 flex justify-center gap-2">
                <span className="rounded bg-background/60 px-1.5 py-0.5 text-[9px] text-foreground/70">getCntrList API</span>
                <span className="rounded bg-background/60 px-1.5 py-0.5 text-[9px] text-foreground/70">getHostList API</span>
              </div>
            </div>
            <DownArrowSmall />
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-center">
              <div className="text-[10px] font-semibold text-indigo-300">queryClient.setQueryData()</div>
              <div className="text-[10px] text-muted-foreground">변경된 행만 참조 교체</div>
            </div>
          </div>

          {/* NONE */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-center">
              <div className="text-xs font-bold text-muted-foreground">NONE</div>
              <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                <div>현재 페이지와</div>
                <div>무관한 알람</div>
              </div>
            </div>
            <DownArrowSmall />
            <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-center">
              <div className="text-[10px] text-muted-foreground">무시 (큐 비우기)</div>
            </div>
          </div>
        </div>

        <DownArrow />

        {/* Row 6: Tables */}
        <div className="flex justify-center gap-3">
          <TableBox label="HostTable" />
          <TableBox label="CntrTable" />
          <TableBox label="HostExpandRow" />
        </div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <span className="text-lg font-bold text-muted-foreground">→</span>
  );
}

function DownArrow() {
  return (
    <div className="flex justify-center py-2 text-lg font-bold text-muted-foreground">↓</div>
  );
}

function DownArrowSmall() {
  return (
    <div className="text-sm font-bold text-muted-foreground">↓</div>
  );
}

function HandlerBox({
  label,
  badge,
  badgeColor,
  desc,
  component,
}: {
  label: string;
  badge: string;
  badgeColor: string;
  desc: string;
  component: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/60 px-4 py-3 text-center">
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
        {badge}
      </span>
      <span className="text-xs font-semibold text-foreground/80">{label}</span>
      <span className="text-[10px] text-muted-foreground">{desc}</span>
      <span className="mt-1 rounded bg-secondary/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
        {component}
      </span>
    </div>
  );
}

function TableBox({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/80 px-4 py-2 text-center">
      <div className="text-[11px] font-semibold text-foreground/80">{label}</div>
      <div className="text-[9px] text-muted-foreground">리렌더</div>
    </div>
  );
}
