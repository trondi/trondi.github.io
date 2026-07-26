"use client";

import { useState } from "react";

// 종은 noti+cmd 두 채널에 점등, 읽음은 아이콘별 독립 - 마커 3개가 필요한 이유를
// 직접 눌러보는 데모. 값은 단조 증가 카운터로 단순화 (실제로는 수신 시각 timestamp).
export function AlarmReadMarkersDiagram() {
  const [notiSeq, setNotiSeq] = useState(0);
  const [cmdSeq, setCmdSeq] = useState(0);
  const [notiRead, setNotiRead] = useState(0);
  const [cmdRead, setCmdRead] = useState(0);
  const [bellCmdRead, setBellCmdRead] = useState(0);

  const bellLit = notiSeq > notiRead || cmdSeq > bellCmdRead;
  const userReqLit = cmdSeq > cmdRead;

  const reset = () => {
    setNotiSeq(0);
    setCmdSeq(0);
    setNotiRead(0);
    setCmdRead(0);
    setBellCmdRead(0);
  };

  const btn =
    "rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-secondary";

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        읽음 마커 시뮬레이터
      </div>

      <div className="p-5">
        {/* 액션 버튼 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button className={btn} onClick={() => setNotiSeq((v) => v + 1)}>
            noti 알람 수신
          </button>
          <button className={btn} onClick={() => setCmdSeq((v) => v + 1)}>
            cmd 알람 수신
          </button>
          <button
            className={btn}
            onClick={() => {
              setNotiRead(notiSeq);
              setBellCmdRead(cmdSeq); // 종의 두 마커만 - cmd.lastRead는 안 건드림
            }}
          >
            종 모달 열기
          </button>
          <button
            className={btn}
            onClick={() => setCmdRead(cmdSeq)} // cmd.lastRead만 - 종 마커는 그대로
          >
            User Request 모달 열기
          </button>
          <button className={`${btn} text-muted-foreground`} onClick={reset}>
            리셋
          </button>
        </div>

        {/* 아이콘 상태 */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {[
            { name: "Noti 종", lit: bellLit, formula: "noti축 미읽음 OR cmd축(bellCmdLastRead) 미읽음" },
            { name: "User Request", lit: userReqLit, formula: "cmd.lastSeq > cmd.lastRead" },
          ].map((icon) => (
            <div
              key={icon.name}
              className={`rounded-xl border p-3 ${
                icon.lit
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-border bg-background/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    icon.lit ? "bg-red-500" : "bg-muted-foreground/30"
                  }`}
                />
                <span className="text-sm font-semibold text-foreground/90">{icon.name}</span>
                <span className={`ml-auto text-xs font-semibold ${icon.lit ? "text-red-400" : "text-muted-foreground"}`}>
                  {icon.lit ? "점등" : "소등"}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">{icon.formula}</div>
            </div>
          ))}
        </div>

        {/* 마커 값 */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">마커</th>
                <th className="py-1.5 pr-3 font-medium">값</th>
                <th className="py-1.5 font-medium">갱신 시점</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-3 text-foreground/80">noti.lastSeq</td>
                <td className="py-1.5 pr-3 text-orange-400">{notiSeq}</td>
                <td className="py-1.5 font-sans text-muted-foreground">noti 수신 시</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-3 text-foreground/80">cmd.lastSeq</td>
                <td className="py-1.5 pr-3 text-orange-400">{cmdSeq}</td>
                <td className="py-1.5 font-sans text-muted-foreground">cmd 수신 시</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-3 text-foreground/80">noti.lastRead</td>
                <td className="py-1.5 pr-3 text-indigo-400">{notiRead}</td>
                <td className="py-1.5 font-sans text-muted-foreground">종 모달 열 때</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-3 text-foreground/80">bellCmdLastRead</td>
                <td className="py-1.5 pr-3 text-indigo-400">{bellCmdRead}</td>
                <td className="py-1.5 font-sans text-muted-foreground">종 모달 열 때 (독립 마커)</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-foreground/80">cmd.lastRead</td>
                <td className="py-1.5 pr-3 text-indigo-400">{cmdRead}</td>
                <td className="py-1.5 font-sans text-muted-foreground">User Request 모달 열 때</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
          시나리오: cmd 수신 → 두 아이콘 모두 점등 → User Request 모달 열기 →
          User Request만 소등, 종은 여전히 점등 (bellCmdLastRead가 안 바뀌었으므로).
          종 모달을 열어야 종이 꺼진다 - 반대로 종 모달을 먼저 열어도
          User Request는 켜져 있다.
        </div>
      </div>
    </div>
  );
}
