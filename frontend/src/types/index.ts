export type PointType = 'paleciarnia' | 'nest1' | 'nest2' | 'gniazdo' | 'ladowanie';

export interface OperationalPoint {
  id: string;
  worldX: number;
  worldY: number;
  type: PointType;
  label: string;
}

export type UploadStatus = 'idle' | 'uploading' | 'translating' | 'ready' | 'error';

export interface ObstacleZone {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface Route {
  id: string;
  fromId: string;
  toId: string;
  path: Array<{ x: number; y: number }>;
  distanceM: number;
}

export interface ModelBounds {
  minX: number; minY: number;
  maxX: number; maxY: number;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface UploadResponse {
  urn: string;
  status: string;
}

export interface StatusResponse {
  urn: string;
  status: string;
  progress: string;
}
