import { useEffect, useRef } from 'react';
import { useSimulatorStore } from '../stores/useSimulatorStore';
import type { ApsViewer } from '../App';

declare const Autodesk: {
  Viewing: {
    CAMERA_CHANGE_EVENT: string;
    GEOMETRY_LOADED_EVENT: string;
    Initializer: (opts: object, cb: () => void) => void;
    Document: {
      load: (id: string, ok: (d: unknown) => void, err: (c: number, m: string) => void) => void;
    };
    GuiViewer3D: new (el: HTMLElement, cfg?: object) => ApsViewer;
  };
};

interface Props {
  onViewerReady: (viewer: ApsViewer) => void;
}

function detectUnits(viewer: ApsViewer) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const m = viewer.model as any;
  const data = m?.getData?.();

  const unitStr: string  = m?.getUnitString?.()  ?? data?.metadata?.['default unit type'] ?? '';
  const unitScale: number = m?.getUnitScale?.()  ?? 1;
  const bbox = m?.getBoundingBox?.();

  console.info('[Units] unitString:', unitStr);
  console.info('[Units] getUnitScale():', unitScale);
  console.info('[Units] bbox:', bbox?.min, '→', bbox?.max);
  console.info('[Units] metadata:', JSON.stringify(data?.metadata ?? {}));

  const store = useSimulatorStore.getState();
  if (unitStr) store.setUnitString(unitStr);
  if (typeof unitScale === 'number' && isFinite(unitScale) && unitScale > 0) {
    store.setUnitScale(unitScale);
  }

  // Also expose viewer on window for emergency console inspection
  (window as any).__viewer = viewer;
}

export function MapViewer({ onViewerReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ApsViewer | null>(null);
  const initializedRef = useRef(false);

  const urn = useSimulatorStore((s) => s.urn);

  useEffect(() => {
    if (!containerRef.current || !urn || initializedRef.current) return;
    initializedRef.current = true;

    const options = {
      env: 'AutodeskProduction2',
      api: 'streamingV2',
      getAccessToken: async (callback: (token: string, exp: number) => void) => {
        try {
          const res = await fetch('/api/aps/token');
          const data = await res.json();
          callback(data.access_token, data.expires_in);
        } catch (e) {
          console.error('Failed to obtain APS token', e);
        }
      },
    };

    Autodesk.Viewing.Initializer(options, () => {
      if (!containerRef.current) return;

      const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, {});
      if (viewer.start() !== 0) {
        console.error('Viewer failed to start');
        return;
      }
      viewerRef.current = viewer;

      // Stable click handler — reads store state directly to avoid stale closures
      viewer.canvas.addEventListener('click', (e: MouseEvent) => {
        const { isPlacingPoint, selectedPointType, addPoint } = useSimulatorStore.getState();
        if (!isPlacingPoint) return;

        const rect = viewer.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = viewer.clientToWorld(x, y, false);
        if (!hit) return;

        addPoint({
          id: crypto.randomUUID(),
          worldX: hit.point.x,
          worldY: hit.point.y,
          type: selectedPointType,
          label: '',
        });
      });

      // Update cursor style reactively
      useSimulatorStore.subscribe((state) => {
        if (viewerRef.current) {
          viewerRef.current.canvas.style.cursor = state.isPlacingPoint ? 'crosshair' : 'default';
        }
      });

      const docId = `urn:${urn}`;
      Autodesk.Viewing.Document.load(
        docId,
        (doc: unknown) => {
          const root = (doc as { getRoot: () => { search: (q: object) => unknown[]; getDefaultGeometry: () => unknown } }).getRoot();
          const views2d = root.search({ type: 'geometry', role: '2d' });
          const target = views2d.length > 0 ? views2d[0] : root.getDefaultGeometry();
          viewer.loadDocumentNode(doc, target).then(() => {
            onViewerReady(viewer);
            // Detect units immediately after model is loaded
            detectUnits(viewer);
          });

          viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
            try {
              const bbox = viewer.model?.getBoundingBox();
              if (bbox?.min && bbox?.max) {
                useSimulatorStore.getState().setModelBounds({
                  minX: bbox.min.x, minY: bbox.min.y,
                  maxX: bbox.max.x, maxY: bbox.max.y,
                });
              }
            } catch { /* bounds not available for this model type */ }

            try {
              /* eslint-disable @typescript-eslint/no-explicit-any */
              const m = viewer.model as any;
              const str: string | undefined = m?.getUnitString?.();
              const scale: number | undefined = m?.getUnitScale?.();
              console.info('[MapViewer] unitString:', str, '| getUnitScale():', scale);
              if (str) useSimulatorStore.getState().setUnitString(str);
              if (typeof scale === 'number' && scale > 0 && isFinite(scale)) {
                useSimulatorStore.getState().setUnitScale(scale);
              }
            } catch (e) { console.warn('[MapViewer] unit detection failed:', e); }
          });
        },
        (code: number, msg: string) => {
          console.error(`APS load error ${code}: ${msg}`);
          useSimulatorStore.getState().setUploadStatus(
            'error',
            'Nie można załadować mapy — plik wygasł lub jest niedostępny. Wgraj plik ponownie.',
          );
        },
      );
    });

    return () => {
      if (viewerRef.current) {
        viewerRef.current.finish();
        viewerRef.current = null;
        initializedRef.current = false;
      }
    };
  }, [urn, onViewerReady]);

  return <div ref={containerRef} className="viewer-container" />;
}
