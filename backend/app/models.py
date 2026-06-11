from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime
from app.database import Base


class MapData(Base):
    __tablename__ = "map_data"

    urn        = Column(String, primary_key=True, index=True)
    filename   = Column(String, nullable=True)
    points     = Column(Text, default="[]")
    obstacles  = Column(Text, default="[]")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
