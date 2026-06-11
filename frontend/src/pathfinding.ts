export interface GridBounds {
  minX: number; minY: number;
  maxX: number; maxY: number;
}

export interface GridCell { x: number; y: number }

const DIRS = [
  { dx:  1, dy:  0, cost: 1 },
  { dx: -1, dy:  0, cost: 1 },
  { dx:  0, dy:  1, cost: 1 },
  { dx:  0, dy: -1, cost: 1 },
  { dx:  1, dy:  1, cost: 1.414 },
  { dx:  1, dy: -1, cost: 1.414 },
  { dx: -1, dy:  1, cost: 1.414 },
  { dx: -1, dy: -1, cost: 1.414 },
];

function octile(a: GridCell, b: GridCell): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

export function astar(
  grid: Uint8Array,
  cols: number, rows: number,
  start: GridCell, end: GridCell,
): GridCell[] | null {
  const idx = (c: GridCell) => c.y * cols + c.x;
  const n = cols * rows;

  const g = new Float32Array(n).fill(Infinity);
  const f = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const inOpen = new Uint8Array(n);

  const si = idx(start);
  g[si] = 0;
  f[si] = octile(start, end);
  const open: GridCell[] = [start];
  inOpen[si] = 1;

  while (open.length > 0) {
    let mi = 0;
    for (let i = 1; i < open.length; i++) if (f[idx(open[i])] < f[idx(open[mi])]) mi = i;
    const cur = open.splice(mi, 1)[0];
    inOpen[idx(cur)] = 0;

    if (cur.x === end.x && cur.y === end.y) {
      const path: GridCell[] = [];
      let k = idx(cur);
      while (k !== -1) {
        path.unshift({ x: k % cols, y: Math.floor(k / cols) });
        k = parent[k];
      }
      return path;
    }

    for (const { dx, dy, cost } of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (!grid[ny * cols + nx]) continue;
      // Prevent diagonal corner-cutting through walls
      if (dx !== 0 && dy !== 0) {
        if (!grid[cur.y * cols + (cur.x + dx)]) continue;
        if (!grid[(cur.y + dy) * cols + cur.x]) continue;
      }
      const nb: GridCell = { x: nx, y: ny };
      const nk = idx(nb);
      const tg = g[idx(cur)] + cost;
      if (tg < g[nk]) {
        parent[nk] = idx(cur);
        g[nk] = tg;
        f[nk] = tg + octile(nb, end);
        if (!inOpen[nk]) { open.push(nb); inOpen[nk] = 1; }
      }
    }
  }
  return null;
}

export function buildGrid(
  bounds: GridBounds,
  obstacles: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  resolution = 200,
): { grid: Uint8Array; cols: number; rows: number; cellW: number; cellH: number } {
  const cols = resolution, rows = resolution;
  const cellW = (bounds.maxX - bounds.minX) / cols;
  const cellH = (bounds.maxY - bounds.minY) / rows;
  const grid = new Uint8Array(cols * rows).fill(1);

  for (const obs of obstacles) {
    const gx1 = Math.max(0,        Math.floor((Math.min(obs.x1, obs.x2) - bounds.minX) / cellW) - 1);
    const gx2 = Math.min(cols - 1, Math.ceil ((Math.max(obs.x1, obs.x2) - bounds.minX) / cellW) + 1);
    const gy1 = Math.max(0,        Math.floor((Math.min(obs.y1, obs.y2) - bounds.minY) / cellH) - 1);
    const gy2 = Math.min(rows - 1, Math.ceil ((Math.max(obs.y1, obs.y2) - bounds.minY) / cellH) + 1);
    for (let gy = gy1; gy <= gy2; gy++)
      for (let gx = gx1; gx <= gx2; gx++)
        grid[gy * cols + gx] = 0;
  }
  return { grid, cols, rows, cellW, cellH };
}

export function worldToGrid(
  pt: { x: number; y: number },
  bounds: GridBounds,
  cellW: number, cellH: number,
  cols: number, rows: number,
): GridCell {
  return {
    x: Math.max(0, Math.min(cols - 1, Math.round((pt.x - bounds.minX) / cellW))),
    y: Math.max(0, Math.min(rows - 1, Math.round((pt.y - bounds.minY) / cellH))),
  };
}

export function gridToWorld(
  cell: GridCell,
  bounds: GridBounds,
  cellW: number, cellH: number,
): { x: number; y: number } {
  return {
    x: bounds.minX + (cell.x + 0.5) * cellW,
    y: bounds.minY + (cell.y + 0.5) * cellH,
  };
}

// Line-of-sight string-pulling for path smoothing (Theta*)
export function smoothPath(
  path: GridCell[],
  grid: Uint8Array,
  cols: number, rows: number,
): GridCell[] {
  if (path.length <= 2) return path;
  const result: GridCell[] = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!los(path[anchor], path[i], grid, cols, rows)) {
      result.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  result.push(path[path.length - 1]);
  return result;
}

function los(a: GridCell, b: GridCell, grid: Uint8Array, cols: number, rows: number): boolean {
  let { x: x0, y: y0 } = a;
  const { x: x1, y: y1 } = b;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    if (x0 < 0 || x0 >= cols || y0 < 0 || y0 >= rows || !grid[y0 * cols + x0]) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
  }
}
