import { useCallback, useEffect, useRef, useState } from 'react';
import { useSimulatorStore } from '../stores/useSimulatorStore';
import type { ApsViewer } from '../App';

declare const Autodesk: { Viewing: { CAMERA_CHANGE_EVENT: string } };

interface ScreenRect { id: string; x: number; y: number; w: number; h: number }
interface Drag { sx: number; sy: number; cx: number; cy: number }

// ── THREE helper ──────────────────────────────────────────────────────────────
function makeVec3(x: number, y: number, z: number): unknown {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const T = (window as any).THREE ?? (window as any).Autodesk?.Viewing?.Private?.THREE;
  if (T?.Vector3) return new T.Vector3(x, y, z);
  return { x, y, z };
}

// ── canvas coords → world coords ──────────────────────────────────────────────
function canvasToWorld(viewer: ApsViewer, cx: number, cy: number): { x: number; y: number } | null {
  const hit = viewer.clientToWorld(cx, cy, false);
  if (hit) return { x: hit.point.x, y: hit.point.y };

  const cw = viewer.canvas.clientWidth || viewer.canvas.offsetWidth || 1;
  const ch = viewer.canvas.clientHeight || viewer.canvas.offsetHeight || 1;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const v = viewer as any;

  try {
    const cam = v.impl?.camera;
    if (cam && typeof cam.left === 'number') {
      const z  = cam.zoom || 1;
      const hw = (cam.right - cam.left) / 2 / z;
      const hh = (cam.top - cam.bottom) / 2 / z;
      const ndx =  (cx / cw) * 2 - 1;
      const ndy = -(cy / ch) * 2 + 1;
      return { x: (cam.position?.x ?? 0) + ndx * hw, y: (cam.position?.y ?? 0) + ndy * hh };
    }
  } catch { /* ignore */ }

  try {
    const vp = v.getState?.()?.viewport;
    if (vp?.orthographicHeight) {
      const h = vp.orthographicHeight as number;
      const [ex, ey] = vp.eye as number[];
      return { x: ex + ((cx / cw) - 0.5) * h * (cw / ch), y: ey - ((cy / ch) - 0.5) * h };
    }
  } catch { /* ignore */ }

  try {
    const nav = v.navigation;
    const tgt = nav?.getTarget?.() as { x: number; y: number } | null;
    const oh = v.getState?.()?.viewport?.orthographicHeight as number | undefined;
    if (tgt && oh) return { x: tgt.x + ((cx / cw) - 0.5) * oh * (cw / ch), y: tgt.y - ((cy / ch) - 0.5) * oh };
  } catch { /* ignore */ }

  const bounds = useSimulatorStore.getState().modelBounds;
  if (bounds) return {
    x: bounds.minX + (cx / cw) * (bounds.maxX - bounds.minX),
    y: bounds.maxY - (cy / ch) * (bounds.maxY - bounds.minY),
  };

  return { x: cx, y: -cy };
}

// ── world coords → canvas-relative screen coords ──────────────────────────────
function worldToCanvas(viewer: ApsViewer, wx: number, wy: number): { x: number; y: number } {
  const sc = viewer.worldToClient(makeVec3(wx, wy, 0) as Parameters<typeof viewer.worldToClient>[0]);
  return { x: sc.x, y: sc.y };
}

// ─────────────────────────────────────────────────────────────────────────────

export function ObstacleLayer({ viewer }: { viewer: ApsViewer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing      = useSimulatorStore((s) => s.isDrawingObstacle);
  const obstacles      = useSimulatorStore((s) => s.obstacles);
  const addObstacle    = useSimulatorStore((s) => s.addObstacle);
  const removeObstacle = useSimulatorStore((s) => s.removeObstacle);

  const [drag,        setDrag       ] = useState<Drag | null>(null);
  const [screenRects, setScreenRects] = useState<ScreenRect[]>([]);

  // ── project stored obstacles → canvas-relative pixel coords ──────────────────

  const project = useCallback(() => {
    if (obstacles.length === 0) { setScreenRects([]); return; }
    const rects = obstacles.map((o) => {
      try {
        const s1 = worldToCanvas(viewer, o.x1, o.y1);
        const s2 = worldToCanvas(viewer, o.x2, o.y2);
        return {
          id: o.id,
          x: Math.min(s1.x, s2.x), y: Math.min(s1.y, s2.y),
          w: Math.abs(s2.x - s1.x), h: Math.abs(s2.y - s1.y),
        };
      } catch { return { id: o.id, x: 0, y: 0, w: 0, h: 0 }; }
    }).filter((r) => r.w > 1 && r.h > 1);
    setScreenRects(rects);
  }, [obstacles, viewer]);

  useEffect(() => { project(); }, [project]);

  useEffect(() => {
    const h = () => project();
    viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, h);
    window.addEventListener('resize', h);
    return () => {
      viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, h);
      window.removeEventListener('resize', h);
    };
  }, [viewer, project]);

  // ── drag handlers ─────────────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag({ sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag((d) => d && { ...d, cx: e.clientX, cy: e.clientY });
  };

  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag) return;
    const dx = Math.abs(e.clientX - drag.sx);
    const dy = Math.abs(e.clientY - drag.sy);
    if (dx > 8 || dy > 8) {
      const canR = viewer.canvas.getBoundingClientRect();
      const w1 = canvasToWorld(viewer, drag.sx - canR.left, drag.sy - canR.top);
      const w2 = canvasToWorld(viewer, e.clientX - canR.left, e.clientY - canR.top);
      if (w1 && w2) addObstacle({ id: crypto.randomUUID(), x1: w1.x, y1: w1.y, x2: w2.x, y2: w2.y });
    }
    setDrag(null);
  };

  const inProg = drag && {
    left:   Math.min(drag.sx, drag.cx),
    top:    Math.min(drag.sy, drag.cy),
    width:  Math.abs(drag.cx - drag.sx),
    height: Math.abs(drag.cy - drag.sy),
  };

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25 }}>

      {/* Capture overlay — only active while drawing */}
      {isDrawing && (
        <div
          style={{ position: 'absolute', inset: 0, cursor: 'cell', pointerEvents: 'all', zIndex: 26 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => setDrag(null)}
        />
      )}

      {/* In-progress rectangle (viewport-relative) */}
      {inProg && inProg.width > 3 && inProg.height > 3 && (
        <div style={{
          position: 'fixed',
          left: inProg.left, top: inProg.top,
          width: inProg.width, height: inProg.height,
          border: '2px dashed #ef4444',
          background: 'rgba(239,68,68,0.12)',
          pointerEvents: 'none',
          zIndex: 200,
        }} />
      )}

      {/* Stored obstacles — rendered as absolutely-positioned divs over the viewer canvas */}
      {screenRects.map(({ id, x, y, w, h }) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            left: x,
            top:  y,
            width:  w,
            height: h,
            border: '2px dashed #ef4444',
            background: 'rgba(239,68,68,0.25)',
            boxSizing: 'border-box',
            pointerEvents: isDrawing ? 'none' : 'all',
            zIndex: 27,
          }}
        >
          {!isDrawing && (
            <button
              onClick={() => removeObstacle(id)}
              style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 22, height: 22,
                borderRadius: '50%',
                border: '1.5px solid #ef4444',
                background: 'var(--surface)',
                color: '#ef4444',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, lineHeight: 1, padding: 0,
                pointerEvents: 'all',
              }}
              title="Usuń strefę"
            >×</button>
          )}
        </div>
      ))}
    </div>
  );
}
