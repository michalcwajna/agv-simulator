import { useCallback, useEffect, useRef, useState } from 'react';
import { useSimulatorStore } from '../stores/useSimulatorStore';
import type { ApsViewer } from '../App';

declare const Autodesk: { Viewing: { CAMERA_CHANGE_EVENT: string } };

interface ScreenRoute { id: string; points: string; midX: number; midY: number }

function makeVec3(x: number, y: number, z: number): unknown {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const T = (window as any).THREE ?? (window as any).Autodesk?.Viewing?.Private?.THREE;
  if (T?.Vector3) return new T.Vector3(x, y, z);
  return { x, y, z };
}

export function RouteLayer({ viewer }: { viewer: ApsViewer }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const routes = useSimulatorStore((s) => s.routes);
  const removeRoute = useSimulatorStore((s) => s.removeRoute);
  const [screenRoutes, setScreenRoutes] = useState<ScreenRoute[]>([]);

  const project = useCallback(() => {
    if (routes.length === 0) { setScreenRoutes([]); return; }

    // svgRef may be null on the first call (SVG not in DOM yet). Re-run after mount via the effect.
    const svgR = svgRef.current?.getBoundingClientRect();
    const canR = viewer.canvas.getBoundingClientRect();
    const ox = svgR ? canR.left - svgR.left : 0;
    const oy = svgR ? canR.top  - svgR.top  : 0;

    const projected = routes.map((r) => {
      try {
        const pts = r.path.map((pt) => {
          const sc = viewer.worldToClient(makeVec3(pt.x, pt.y, 0) as Parameters<typeof viewer.worldToClient>[0]);
          return { x: sc.x + ox, y: sc.y + oy };
        });
        const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };
        console.debug('[Route] projected', pts.length, 'pts, first:', pts[0], 'last:', pts[pts.length - 1]);
        return {
          id: r.id,
          points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
          midX: mid.x,
          midY: mid.y,
        };
      } catch (e) {
        console.error('[Route] projection failed', e);
        return null;
      }
    }).filter(Boolean) as ScreenRoute[];

    console.debug('[Route] setScreenRoutes', projected.length);
    setScreenRoutes(projected);
  }, [routes, viewer]);

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

  return (
    <svg
      ref={svgRef}
      className="point-overlay"
      style={{ pointerEvents: 'none', zIndex: 22 }}
    >
      <defs>
        <marker id="agv-arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#00d4aa" />
        </marker>
      </defs>
      {screenRoutes.map(({ id, points, midX, midY }) => (
        <g key={id}>
          {/* Glow */}
          <polyline
            points={points}
            fill="none" stroke="#00d4aa" strokeWidth={8} strokeOpacity={0.2}
            strokeLinejoin="round" strokeLinecap="round"
          />
          {/* Animated dashed path */}
          <polyline
            points={points}
            fill="none" stroke="#00d4aa" strokeWidth={3}
            strokeDasharray="12,6"
            strokeLinejoin="round" strokeLinecap="round"
            className="route-path"
          />
          {/* Delete button */}
          <g
            transform={`translate(${midX},${midY})`}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onClick={() => removeRoute(id)}
          >
            <circle r={10} fill="var(--surface)" stroke="#00d4aa" strokeWidth={1.5} />
            <line x1="-4" y1="-4" x2="4" y2="4" stroke="#00d4aa" strokeWidth={1.5} />
            <line x1="4" y1="-4" x2="-4" y2="4" stroke="#00d4aa" strokeWidth={1.5} />
          </g>
        </g>
      ))}
    </svg>
  );
}
