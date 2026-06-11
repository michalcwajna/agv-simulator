import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import aps, maps

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AGV Simulator API", version="0.1.0")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(aps.router)
app.include_router(maps.router)


@app.get("/health")
def health():
    return {"status": "ok"}
