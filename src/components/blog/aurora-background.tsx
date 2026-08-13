/**
 * 오로라 배경 — 아주 느리게 부유하는 빛 얼룩 3개.
 * 순수 CSS(blur된 radial-gradient)라 런타임 비용이 사실상 없고,
 * prefers-reduced-motion에서는 애니메이션만 멈춘다.
 */
export function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden>
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
    </div>
  );
}
