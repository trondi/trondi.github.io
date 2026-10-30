/** 격자 A* — 탭한 곳까지 장애물(강·나무·집)을 돌아가는 길을 찾는다 */

export type Walkable = (x: number, z: number) => boolean;
export type Point = { x: number; z: number };

const CELL = 0.3;
const MIN_X = -26;
const MIN_Z = -23;
const COLS = Math.ceil(52 / CELL);
const ROWS = Math.ceil(46 / CELL);

export class NavGrid {
  private open: Uint8Array;

  constructor(private walkable: Walkable) {
    this.open = new Uint8Array(COLS * ROWS);
    this.rebuild();
  }

  rebuild() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.open[r * COLS + c] = this.walkable(MIN_X + (c + 0.5) * CELL, MIN_Z + (r + 0.5) * CELL) ? 1 : 0;
      }
    }
  }

  private cellOf(p: Point) {
    return {
      c: Math.min(COLS - 1, Math.max(0, Math.floor((p.x - MIN_X) / CELL))),
      r: Math.min(ROWS - 1, Math.max(0, Math.floor((p.z - MIN_Z) / CELL))),
    };
  }

  private center(i: number): Point {
    return { x: MIN_X + ((i % COLS) + 0.5) * CELL, z: MIN_Z + (Math.floor(i / COLS) + 0.5) * CELL };
  }

  /** 막힌 곳을 탭했을 때 가장 가까운 걸을 수 있는 칸 */
  nearestOpen(p: Point, maxRadius = 24): Point | null {
    const { c, r } = this.cellOf(p);
    for (let rad = 0; rad <= maxRadius; rad++) {
      let best: number | null = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
          const i = rr * COLS + cc;
          if (!this.open[i]) continue;
          const q = this.center(i);
          const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best !== null) return this.center(best);
    }
    return null;
  }

  private lineClear(a: Point, b: Point) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  find(from: Point, to: Point): Point[] | null {
    const goal = this.walkable(to.x, to.z) ? to : this.nearestOpen(to);
    if (!goal) return null;
    if (this.lineClear(from, goal)) return [goal];

    const s = this.cellOf(from);
    const g = this.cellOf(goal);
    const start = s.r * COLS + s.c;
    const target = g.r * COLS + g.c;
    const N = COLS * ROWS;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: [number, number][] = [];
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const h = (i: number) => Math.hypot((i % COLS) - g.c, Math.floor(i / COLS) - g.r);

    gScore[start] = 0;
    push(h(start), start);
    let found = false;
    while (heap.length) {
      const [, cur] = pop();
      if (cur === target) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % COLS;
      const cr = Math.floor(cur / COLS);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
          const ni = nr * COLS + nc;
          if (!this.open[ni] || closed[ni]) continue;
          // 대각선은 양옆이 모두 열려 있을 때만 (모서리 끼임 방지)
          if (dr && dc && (!this.open[cr * COLS + nc] || !this.open[nr * COLS + cc])) continue;
          const ng = gScore[cur] + (dr && dc ? Math.SQRT2 : 1);
          if (ng < gScore[ni]) {
            gScore[ni] = ng;
            came[ni] = cur;
            push(ng + h(ni), ni);
          }
        }
      }
    }
    if (!found) return null;

    const cells: Point[] = [];
    for (let i = target; i !== -1 && i !== start; i = came[i]) cells.push(this.center(i));
    cells.reverse();
    if (!cells.length) return [goal];
    cells[cells.length - 1] = goal;

    // 직선으로 갈 수 있는 중간 점은 건너뛴다
    const path: Point[] = [];
    let anchor = from;
    for (let k = 0; k < cells.length; k++) {
      const next = cells[k + 1];
      if (next && this.lineClear(anchor, next)) continue;
      path.push(cells[k]);
      anchor = cells[k];
    }
    return path;
  }
}
