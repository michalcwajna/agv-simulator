from fastapi import APIRouter, HTTPException, UploadFile, File

from app.config import settings
from app.services.aps_service import APSService

router = APIRouter(prefix="/api/aps", tags=["aps"])
_svc = APSService(settings.aps_client_id, settings.aps_client_secret, settings.aps_bucket_key)

ALLOWED_EXTENSIONS = (".dwg", ".dxf")


@router.get("/token")
async def viewer_token():
    return await _svc.get_viewer_token()


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    if not any(name.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(400, "Obsługiwane formaty: .dwg, .dxf")

    content = await file.read()
    object_key = (file.filename or "drawing").replace(" ", "_")
    urn = await _svc.upload_file(object_key, content)
    await _svc.translate(urn)
    return {"urn": urn, "filename": file.filename}


@router.get("/status/{urn}")
async def translation_status(urn: str):
    manifest = await _svc.get_manifest(urn)
    return {
        "urn": urn,
        "status": manifest.get("status", "unknown"),
        "progress": manifest.get("progress", ""),
    }
