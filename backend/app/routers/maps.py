import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MapData

router = APIRouter(prefix="/api/maps", tags=["maps"])


class MapPayload(BaseModel):
    points:    list[Any] = []
    obstacles: list[Any] = []


@router.get("")
def get_map_data(urn: str = Query(...), db: Session = Depends(get_db)):
    row = db.query(MapData).filter(MapData.urn == urn).first()
    if not row:
        return {"points": [], "obstacles": []}
    return {
        "points":    json.loads(row.points    or "[]"),
        "obstacles": json.loads(row.obstacles or "[]"),
    }


@router.put("")
def save_map_data(urn: str = Query(...), payload: MapPayload = Body(...), db: Session = Depends(get_db)):
    row = db.query(MapData).filter(MapData.urn == urn).first()
    if not row:
        row = MapData(urn=urn)
        db.add(row)
    row.points    = json.dumps(payload.points)
    row.obstacles = json.dumps(payload.obstacles)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
