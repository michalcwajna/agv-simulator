import { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MapViewer } from './components/MapViewer';
import { PointLayer } from './components/PointLayer';
import { ObstacleLayer } from './components/ObstacleLayer';
import { RouteLayer } from './components/RouteLayer';
import { LoginScreen, isAuthenticated } from './components/LoginScreen';
import { useSimulatorStore } from './stores/useSimulatorStore';
import { loadMapData, saveMapData } from './api';

export interface ApsViewer {
  start: () => number;
  finish: () => void;
  loadDocumentNode: (doc: unknown, node: unknown) => Promise<void>;
  clientToWorld: (x: number, y: number, snap: boolean) => { point: { x: number; y: number; z: number } } | null;
  worldToClient: (pt: { x: number; y: number; z: number }) => { x: number; y: number };
  addEventListener: (ev: string, fn: () => void) => void;
  removeEventListener: (ev: string, fn: () => void) => void;
  canvas: HTMLCanvasElement;
  model: { getBoundingBox: () => { min: { x: number; y: number }; max: { x: number; y: number } } | null };
}

type Viewer = ApsViewer;

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const uploadStatus = useSimulatorStore((s) => s.uploadStatus);

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }
  const urn          = useSimulatorStore((s) => s.urn);
  const points       = useSimulatorStore((s) => s.points);
  const obstacles    = useSimulatorStore((s) => s.obstacles);

  const isHydrating  = useRef(false);
  const saveTimer    = useRef<ReturnType<typeof setTimeout>>();

  const handleViewerReady = useCallback(async (v: Viewer) => {
    setViewer(v);

    const currentUrn = useSimulatorStore.getState().urn;
    if (!currentUrn) return;

    isHydrating.current = true;
    try {
      const data = await loadMapData(currentUrn);
      useSimulatorStore.getState().setPoints(data.points ?? []);
      useSimulatorStore.getState().setObstacles(data.obstacles ?? []);
    } catch (e) {
      console.warn('[App] Could not load map data from server:', e);
    } finally {
      isHydrating.current = false;
    }
  }, []);

  // Auto-save points + obstacles to server whenever they change (debounced)
  useEffect(() => {
    if (!viewer || !urn) return;
    if (isHydrating.current) return;

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const s = useSimulatorStore.getState();
      saveMapData(s.urn!, s.points, s.obstacles).catch((e) =>
        console.warn('[App] Auto-save failed:', e)
      );
    }, 800);
  }, [points, obstacles, viewer, urn]);

  return (
    <div className="layout">
      <Header />
      <div className="main">
        <Sidebar />
        <div className="viewer-area">
          {uploadStatus !== 'ready' ? (
            <div className="viewer-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              <p>Wczytaj plik .dwg lub .dxf aby wyświetlić mapę zakładu</p>
            </div>
          ) : (
            <>
              <MapViewer onViewerReady={handleViewerReady} />
              {viewer && (
                <>
                  <ObstacleLayer viewer={viewer} />
                  <RouteLayer viewer={viewer} />
                  <PointLayer viewer={viewer} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
