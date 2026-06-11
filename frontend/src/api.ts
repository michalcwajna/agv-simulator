import type { ObstacleZone, OperationalPoint } from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export async function loadMapData(urn: string): Promise<{ points: OperationalPoint[]; obstacles: ObstacleZone[] }> {
  const res = await fetch(`${BASE}/api/maps/${encodeURIComponent(urn)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveMapData(urn: string, points: OperationalPoint[], obstacles: ObstacleZone[]): Promise<void> {
  await fetch(`${BASE}/api/maps/${encodeURIComponent(urn)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, obstacles }),
  });
}
