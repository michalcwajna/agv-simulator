import { useEffect, useRef, useState, useCallback } from 'react';
import { useSimulatorStore } from '../stores/useSimulatorStore';
import type { ApsViewer } from '../App';
import type { PointType } from '../types';


const COLORS: Record<PointType, string> = {
  paleciarnia: '#22c55e',
  nest1:       '#3b82f6',
  nest2:       '#a855f7',
  gniazdo:     '#eab308',
  ladowanie:   '#f97316',
};

const LABELS: Record<PointType, string> = {
  paleciarnia: 'A',
  nest1:       'B1',
  nest2:       'B2',
  gniazdo:     'G',
  ladowanie:   'L',
};

interface ScreenPoint { id: string; x: number; y: number; type: PointType; worldX: number; worldY: number }

interface Props { viewer: ApsViewer }

export function PointLayer({ viewer }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const points = useSimulatorStore((s) => s.points);
  const removePoint = useSimulatorStore((s) => s.removePoint);
  const [screenPts, setScreenPts] = useState<ScreenPoint[]>([]);

  const project = useCallback(() => {
    if (!svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const canvasRect = viewer.canvas.getBoundingClientRect();
    const ox = canvasRect.left - svgRect.left;
    const oy = canvasRect.top  - svgRect.top;

    const pts = points.map((p) => {
      const sc = viewer.worldToClient({ x: p.worldX, y: p.worldY, z: 0 });
      return { id: p.id, x: sc.x + ox, y: sc.y + oy, type: p.type, worldX: p.worldX, worldY: p.worldY };
    });
    setScreenPts(pts);
  }, [points, viewer]);

  // Re-project on camera change and whenever points list changes
  useEffect(() => { project(); }, [project]);

  useEffect(() => {
    const handler = () => project();
    viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, handler);
    window.addEventListener('resize', handler);
    return () => {
      viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, handler);
      window.removeEventListener('resize', handler);
    };
  }, [viewer, project]);

  return (
    <svg ref={svgRef} className="point-overlay" style={{ zIndex: 30 }}>
      {screenPts.map(({ id, x, y, type }) => (
        <g key={id} transform={`translate(${x},${y})`} style={{ pointerEvents: 'all' }}>
          {/* Shadow */}
          <circle r={13} fill="rgba(0,0,0,0.4)" transform="translate(1,1)" />
          {/* Body */}
          <circle
            r={12}
            fill={COLORS[type]}
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); removePoint(id); }}
          />
          {/* Label */}
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={10}
            fontWeight="700"
            fontFamily="monospace"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {LABELS[type]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Autodesk: { Viewing: { CAMERA_CHANGE_EVENT: string } };
