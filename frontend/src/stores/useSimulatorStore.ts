import { create } from 'zustand';
import type { ModelBounds, ObstacleZone, OperationalPoint, PointType, Route, UploadStatus } from '../types';

const LS_URN      = 'agv:urn';
const LS_FILENAME = 'agv:fileName';

// URL param takes priority over localStorage (shareable links)
const _urlUrn = new URLSearchParams(window.location.search).get('urn');
if (_urlUrn) {
  localStorage.setItem(LS_URN, _urlUrn);
  // Clean the urn param from the address bar without reloading
  const _clean = new URL(window.location.href);
  _clean.searchParams.delete('urn');
  window.history.replaceState({}, '', _clean.toString());
}

const savedUrn      = _urlUrn ?? localStorage.getItem(LS_URN);
const savedFileName = localStorage.getItem(LS_FILENAME);

interface SimulatorStore {
  // Upload / map
  urn: string | null;
  fileName: string | null;
  uploadStatus: UploadStatus;
  uploadError: string | null;
  translationProgress: string;
  modelBounds: ModelBounds | null;
  unitScale: number;
  unitString: string;
  meterPerUnit: number;

  // Points
  points: OperationalPoint[];
  isPlacingPoint: boolean;
  selectedPointType: PointType;

  // Obstacles
  obstacles: ObstacleZone[];
  isDrawingObstacle: boolean;

  // Routes
  routes: Route[];
  routeFromId: string;
  routeToId: string;

  // Actions
  setUrn: (urn: string, fileName: string) => void;
  setUploadStatus: (status: UploadStatus, error?: string) => void;
  setTranslationProgress: (p: string) => void;
  setModelBounds: (b: ModelBounds) => void;
  setUnitScale: (s: number) => void;
  setUnitString: (s: string) => void;
  setMeterPerUnit: (v: number) => void;

  addPoint: (p: OperationalPoint) => void;
  removePoint: (id: string) => void;
  setIsPlacingPoint: (v: boolean) => void;
  setSelectedPointType: (t: PointType) => void;
  setPoints: (pts: OperationalPoint[]) => void;

  addObstacle: (o: ObstacleZone) => void;
  removeObstacle: (id: string) => void;
  setIsDrawingObstacle: (v: boolean) => void;
  setObstacles: (obs: ObstacleZone[]) => void;

  addRoute: (r: Route) => void;
  removeRoute: (id: string) => void;
  setRouteFromId: (id: string) => void;
  setRouteToId: (id: string) => void;

  reset: () => void;
}

const blankState = {
  urn: null as string | null, fileName: null as string | null,
  uploadStatus: 'idle' as UploadStatus, uploadError: null as string | null, translationProgress: '',
  modelBounds: null as ModelBounds | null, unitScale: 1, unitString: 'm',
  meterPerUnit: 4.483584634334634,
  points: [] as OperationalPoint[], isPlacingPoint: false, selectedPointType: 'paleciarnia' as PointType,
  obstacles: [] as ObstacleZone[], isDrawingObstacle: false,
  routes: [] as Route[], routeFromId: '', routeToId: '',
};

const initial = savedUrn
  ? { ...blankState, urn: savedUrn, fileName: savedFileName, uploadStatus: 'ready' as UploadStatus }
  : blankState;

export const useSimulatorStore = create<SimulatorStore>((set) => ({
  ...initial,

  setUrn: (urn, fileName) => {
    localStorage.setItem(LS_URN, urn);
    localStorage.setItem(LS_FILENAME, fileName);
    set({ urn, fileName });
  },
  setUploadStatus: (uploadStatus, error?) => set({ uploadStatus, uploadError: error ?? null }),
  setTranslationProgress: (translationProgress) => set({ translationProgress }),
  setModelBounds: (modelBounds) => set({ modelBounds }),
  setUnitScale: (unitScale) => set({ unitScale }),
  setUnitString: (unitString) => set({ unitString }),
  setMeterPerUnit: (meterPerUnit) => set({ meterPerUnit }),

  addPoint: (p) => set((s) => ({ points: [...s.points, p] })),
  removePoint: (id) => set((s) => ({ points: s.points.filter((p) => p.id !== id) })),
  setIsPlacingPoint: (isPlacingPoint) => set({ isPlacingPoint }),
  setSelectedPointType: (selectedPointType) => set({ selectedPointType }),
  setPoints: (points) => set({ points }),

  addObstacle: (o) => set((s) => ({ obstacles: [...s.obstacles, o] })),
  removeObstacle: (id) => set((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),
  setIsDrawingObstacle: (isDrawingObstacle) => set({ isDrawingObstacle }),
  setObstacles: (obstacles) => set({ obstacles }),

  addRoute: (r) => set((s) => ({ routes: [...s.routes, r] })),
  removeRoute: (id) => set((s) => ({ routes: s.routes.filter((r) => r.id !== id) })),
  setRouteFromId: (routeFromId) => set({ routeFromId }),
  setRouteToId: (routeToId) => set({ routeToId }),

  reset: () => {
    localStorage.removeItem(LS_URN);
    localStorage.removeItem(LS_FILENAME);
    set(blankState);
  },
}));
