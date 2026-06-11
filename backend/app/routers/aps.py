import base64
import re

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File

from app.config import settings
from app.services.aps_service import APSService

router = APIRouter(prefix="/api/aps", tags=["aps"])
_svc = APSService(settings.aps_client_id, settings.aps_client_secret, settings.aps_bucket_key)

ALLOWED_EXTENSIONS = (".dwg", ".dxf")


def _compute_urn(object_key: str) -> str:
    raw = f"urn:adsk.objects:os.object:{settings.aps_bucket_key}/{object_key}"
    return base64.b64encode(raw.encode()).decode().rstrip("=")


@router.get("/token")
async def viewer_token():
    return await _svc.get_viewer_token()


@router.post("/upload")
async def upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    if not any(name.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(400, "Obsługiwane formaty: .dwg, .dxf")

    content = await file.read()
    # APS OSS keys must be ASCII-safe — strip diacritics/non-ASCII chars
    raw_name = (file.filename or "drawing")
    object_key = re.sub(r'[^a-zA-Z0-9._\-]', '_', raw_name)

    # URN is deterministic — compute immediately and return without waiting for S3
    urn = _compute_urn(object_key)

    async def _do_upload() -> None:
        await _svc.upload_file(object_key, content)
        await _svc.translate(urn)

    background_tasks.add_task(_do_upload)

    return {"urn": urn, "filename": file.filename}


@router.get("/status/{urn}")
async def translation_status(urn: str):
    manifest = await _svc.get_manifest(urn)
    return {
        "urn": urn,
        "status": manifest.get("status", "unknown"),
        "progress": manifest.get("progress", ""),
    }
