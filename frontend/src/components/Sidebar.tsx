import { useState } from 'react';
import { useSimulatorStore } from '../stores/useSimulatorStore';
import { UploadPanel } from './UploadPanel';
import type { PointType } from '../types';
import { buildGrid, worldToGrid, gridToWorld, astar, smoothPath } from '../pathfinding';

// APS translates DWG → SVF2 and normalises all coordinates to metres
// regardless of the original DWG unit. getUnitString() reflects the original
// DWG unit and must NOT be used to re-scale the already-metric viewer values.
function formatDist(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
  if (metres >= 0.5)  return `${metres.toFixed(1)} m`;
  if (metres >= 0.01) return `${(metres * 100).toFixed(1)} cm`;
  return `${(metres * 1000).toFixed(0)} mm`;
}

function ScaleSection() {
  const store = useSimulatorStore();
  const [calRouteId, setCalRouteId] = useState('');
  const [realDist,   setRealDist  ] = useState('');

  const calRoute = store.routes.find((r) => r.id === calRouteId);
  // rawDist = distanceM stored when meterPerUnit was set at save time
  const rawDist = calRoute ? calRoute.distanceM / store.meterPerUnit : null;

  const apply = () => {
    const real = parseFloat(realDist);
    if (!rawDist || !real || real <= 0 || !isFinite(real)) return;
    store.setMeterPerUnit(real / rawDist);
    setRealDist('');
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">Skala modelu</div>

      {/* Manual override */}
      <label className="field-label">1 jednostka modelu =</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <input
          type="number" min="0.0001" step="0.1"
          value={store.meterPerUnit}
          onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0 && isFinite(v)) store.setMeterPerUnit(v); }}
          style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.8rem' }}
        />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>m</span>
      </div>

      {/* Calibration from route */}
      {store.routes.length > 0 && (
        <>
          <label className="field-label">Kalibracja ze zmierzonej trasy</label>
          <select
            className="field-select"
            value={calRouteId}
            onChange={(e) => setCalRouteId(e.target.value)}
          >
            <option value="">-- wybierz trasę wzorcową --</option>
            {store.routes.map((r, i) => {
              const from = store.points.find((p) => p.id === r.fromId);
              const to   = store.points.find((p) => p.id === r.toId);
              return (
                <option key={r.id} value={r.id}>
                  Trasa {i + 1}: {from?.type ?? '?'} → {to?.type ?? '?'} ({formatDist(r.distanceM)})
                </option>
              );
            })}
          </select>
          {calRoute && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number" min="0.1" step="0.1" placeholder="Rzeczywista długość [m]"
                value={realDist}
                onChange={(e) => setRealDist(e.target.value)}
                style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.8rem' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>m</span>
              <button
                className="btn"
                style={{ padding: '4px 10px', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                disabled={!realDist || parseFloat(realDist) <= 0}
                onClick={apply}
              >
                Zastosuj
              </button>
            </div>
          )}
          {calRoute && rawDist && (
            <p className="hint" style={{ marginTop: 4 }}>
              Surowa odległość tej trasy: <strong>{rawDist.toFixed(3)} j.m.</strong>
              {realDist && parseFloat(realDist) > 0
                ? <> → skala: <strong>{(parseFloat(realDist) / rawDist).toFixed(4)} m/j.m.</strong></>
                : null}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const POINT_TYPES: { type: PointType; label: string }[] = [
  { type: 'paleciarnia', label: 'Punkt A Paleciarnia'         },
  { type: 'nest1',       label: 'Punkt B Nest 1'              },
  { type: 'nest2',       label: 'Punkt B Nest 2'              },
  { type: 'gniazdo',     label: 'Gniazdo / Miejsce odkładcze' },
  { type: 'ladowanie',   label: 'Ładowanie'                   },
];

export function Sidebar() {
  const store = useSimulatorStore();
  const ready = store.uploadStatus === 'ready';

  const calcRoute = () => {
    const from = store.points.find((p) => p.id === store.routeFromId);
    const to   = store.points.find((p) => p.id === store.routeToId);
    if (!from || !to) return;

    let bounds = store.modelBounds;
    if (!bounds) {
      // Fallback: derive bounds from all points + generous padding
      const xs = store.points.map((p) => p.worldX);
      const ys = store.points.map((p) => p.worldY);
      const pad = Math.max(
        (Math.max(...xs) - Math.min(...xs)) * 0.3,
        (Math.max(...ys) - Math.min(...ys)) * 0.3,
        100,
      );
      bounds = {
        minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
        minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad,
      };
    }

    const { grid, cols, rows, cellW, cellH } = buildGrid(bounds, store.obstacles, 200);

    const startCell = worldToGrid({ x: from.worldX, y: from.worldY }, bounds, cellW, cellH, cols, rows);
    const endCell   = worldToGrid({ x: to.worldX,   y: to.worldY   }, bounds, cellW, cellH, cols, rows);

    const rawPath = astar(grid, cols, rows, startCell, endCell);
    if (!rawPath) {
      alert('Nie znaleziono ścieżki. Sprawdź czy przeszkody nie blokują całkowicie trasy.');
      return;
    }

    const smoothed = smoothPath(rawPath, grid, cols, rows);
    const worldPath = smoothed.map((cell) => gridToWorld(cell, bounds!, cellW, cellH));
    // Replace grid-snapped endpoints with exact point coordinates
    if (worldPath.length > 0) worldPath[0] = { x: from.worldX, y: from.worldY };
    if (worldPath.length > 1) worldPath[worldPath.length - 1] = { x: to.worldX, y: to.worldY };

    let rawDist = 0;
    for (let i = 1; i < worldPath.length; i++) {
      const dx = worldPath[i].x - worldPath[i - 1].x;
      const dy = worldPath[i].y - worldPath[i - 1].y;
      rawDist += Math.sqrt(dx * dx + dy * dy);
    }
    const distanceM = rawDist * store.meterPerUnit;

    store.addRoute({
      id: crypto.randomUUID(),
      fromId: from.id,
      toId: to.id,
      path: worldPath,
      distanceM,
    });
  };

  return (
    <aside className="sidebar">
      {/* ---- Mapa ---- */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Mapa zakładu</div>
        <UploadPanel />
      </div>

      {ready && (
        <>
          {/* ---- Punkty ---- */}
          <div className="sidebar-section">
            <div className="sidebar-section-title">Punkty operacyjne</div>
            <div className="point-types">
              {POINT_TYPES.map(({ type, label }) => (
                <button
                  key={type} data-type={type}
                  className={`point-type-btn ${store.selectedPointType === type ? 'active' : ''}`}
                  onClick={() => store.setSelectedPointType(type)}
                >
                  <span className="type-dot" /> {label}
                </button>
              ))}
            </div>
            <button
              className={`btn ${store.isPlacingPoint ? 'active' : ''}`}
              onClick={() => {
                store.setIsPlacingPoint(!store.isPlacingPoint);
                store.setIsDrawingObstacle(false);
              }}
            >
              {store.isPlacingPoint ? (
                <><XIcon /> Anuluj dodawanie</>
              ) : (
                <><PlusIcon /> Dodaj punkt na mapie</>
              )}
            </button>
            {store.isPlacingPoint && (
              <p className="hint">Kliknij na mapie aby umieścić punkt <strong style={{ color: 'var(--text)' }}>{store.selectedPointType}</strong>.</p>
            )}
          </div>

          {/* ---- Punkty lista ---- */}
          {store.points.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Punkty ({store.points.length})</div>
              <div className="points-list">
                {store.points.map((p) => (
                  <div key={p.id} className="point-item">
                    <span className="point-item-dot" style={{ background: `var(--${typeColor(p.type)})` }} />
                    <span className="point-item-type">{p.type}</span>
                    <span className="point-item-label">{p.worldX.toFixed(0)}, {p.worldY.toFixed(0)}</span>
                    <button className="point-item-del" onClick={() => store.removePoint(p.id)}>
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Skala modelu ---- */}
          <ScaleSection />

          {/* ---- Przeszkody ---- */}
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              Strefy przeszkód
              <span style={{ marginLeft: 6, fontWeight: 400, fontSize: '0.72rem',
                color: store.obstacles.length > 0 ? 'var(--red)' : 'var(--text-muted)',
                border: '1px solid', borderColor: store.obstacles.length > 0 ? 'var(--red)' : 'var(--border)',
                borderRadius: 10, padding: '1px 6px' }}>
                {store.obstacles.length}
              </span>
            </div>
            <button
              className={`btn ${store.isDrawingObstacle ? 'active' : ''}`}
              style={store.isDrawingObstacle ? { borderColor: 'var(--red)', color: 'var(--red)', background: 'rgba(239,68,68,0.08)' } : {}}
              onClick={() => {
                store.setIsDrawingObstacle(!store.isDrawingObstacle);
                store.setIsPlacingPoint(false);
              }}
            >
              {store.isDrawingObstacle ? <><XIcon /> Anuluj rysowanie</> : <><RectIcon /> Rysuj strefę przeszkód</>}
            </button>
            {store.isDrawingObstacle && (
              <p className="hint">Kliknij i przeciągnij na mapie aby zaznaczyć strefę niedostępną (ściana, regał, filar).</p>
            )}
            {store.obstacles.length === 0 && !store.isDrawingObstacle && (
              <p className="hint" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Brak zapisanych stref.</p>
            )}
            {store.obstacles.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {store.obstacles.map((o, i) => (
                  <div key={o.id} className="point-item">
                    <span className="point-item-dot" style={{ background: 'var(--red)' }} />
                    <span className="point-item-label">Strefa {i + 1}</span>
                    <button className="point-item-del" onClick={() => store.removeObstacle(o.id)}><XIcon /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Trasy ---- */}
          {store.points.length >= 2 && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Wyznacz trasę (A*)</div>
              <label className="field-label">Punkt startowy</label>
              <select
                className="field-select"
                value={store.routeFromId}
                onChange={(e) => store.setRouteFromId(e.target.value)}
              >
                <option value="">-- wybierz --</option>
                {store.points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.type} ({p.worldX.toFixed(0)}, {p.worldY.toFixed(0)})
                  </option>
                ))}
              </select>

              <label className="field-label" style={{ marginTop: 8 }}>Punkt docelowy</label>
              <select
                className="field-select"
                value={store.routeToId}
                onChange={(e) => store.setRouteToId(e.target.value)}
              >
                <option value="">-- wybierz --</option>
                {store.points
                  .filter((p) => p.id !== store.routeFromId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.type} ({p.worldX.toFixed(0)}, {p.worldY.toFixed(0)})
                    </option>
                  ))}
              </select>

              <button
                className="btn"
                style={{ marginTop: 10, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                disabled={!store.routeFromId || !store.routeToId}
                onClick={calcRoute}
              >
                <RouteIcon /> Oblicz trasę
              </button>

              {store.routes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {store.routes.map((r, i) => {
                    const from = store.points.find((p) => p.id === r.fromId);
                    const to   = store.points.find((p) => p.id === r.toId);
                    return (
                      <div key={r.id} className="point-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
                          <span className="point-item-dot" style={{ background: 'var(--accent)', flexShrink: 0 }} />
                          <span className="point-item-label" style={{ flex: 1 }}>
                            Trasa {i + 1}: {from?.type ?? '?'} → {to?.type ?? '?'}
                          </span>
                          <button className="point-item-del" onClick={() => store.removeRoute(r.id)}><XIcon /></button>
                        </div>
                        <span style={{
                          paddingLeft: 18,
                          fontSize: '0.72rem',
                          color: 'var(--accent)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatDist(r.distanceM)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function typeColor(type: PointType): string {
  return ({ paleciarnia: 'green', nest1: 'blue', nest2: 'purple', gniazdo: 'yellow', ladowanie: 'orange' } as const)[type];
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4,2" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
      <path d="M7 12h4l2-4 2 8 2-4h1" />
    </svg>
  );
}
