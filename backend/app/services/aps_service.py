import base64
import time
from typing import Optional

import httpx

APS_BASE = "https://developer.api.autodesk.com"


class APSService:
    def __init__(self, client_id: str, client_secret: str, bucket_key: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.bucket_key = bucket_key
        self._token: Optional[str] = None
        self._token_expiry: float = 0

    async def _get_token(self, scope: str) -> str:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{APS_BASE}/authentication/v2/token",
                data={"grant_type": "client_credentials", "scope": scope},
                auth=(self.client_id, self.client_secret),
            )
            r.raise_for_status()
            data = r.json()
            self._token = data["access_token"]
            self._token_expiry = time.time() + data["expires_in"]
            return self._token

    async def get_viewer_token(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{APS_BASE}/authentication/v2/token",
                data={
                    "grant_type": "client_credentials",
                    "scope": "data:read viewables:read",
                },
                auth=(self.client_id, self.client_secret),
            )
            r.raise_for_status()
            data = r.json()
            return {"access_token": data["access_token"], "expires_in": data["expires_in"]}

    async def _ensure_bucket(self, token: str) -> None:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{APS_BASE}/oss/v2/buckets/{self.bucket_key}/details",
                headers={"Authorization": f"Bearer {token}"},
            )
            if r.status_code == 200:
                return
            r2 = await client.post(
                f"{APS_BASE}/oss/v2/buckets",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"bucketKey": self.bucket_key, "policyKey": "transient"},
            )
            if r2.status_code not in (200, 409):
                r2.raise_for_status()

    async def upload_file(self, object_key: str, content: bytes) -> str:
        token = await self._get_token(
            "data:read data:write data:create bucket:create bucket:read"
        )
        await self._ensure_bucket(token)

        async with httpx.AsyncClient(timeout=300.0) as client:
            # Step 1 — get signed S3 URL
            r = await client.get(
                f"{APS_BASE}/oss/v2/buckets/{self.bucket_key}/objects/{object_key}/signeds3upload",
                headers={"Authorization": f"Bearer {token}"},
                params={"minutesExpiration": 60},
            )
            r.raise_for_status()
            upload_data = r.json()
            upload_key: str = upload_data["uploadKey"]
            s3_url: str = upload_data["urls"][0]

            # Step 2 — upload to S3
            s3 = await client.put(s3_url, content=content)
            s3.raise_for_status()

            # Step 3 — complete upload
            done = await client.post(
                f"{APS_BASE}/oss/v2/buckets/{self.bucket_key}/objects/{object_key}/signeds3upload",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"uploadKey": upload_key},
            )
            done.raise_for_status()

        raw_urn = f"urn:adsk.objects:os.object:{self.bucket_key}/{object_key}"
        return base64.b64encode(raw_urn.encode()).decode().rstrip("=")

    async def translate(self, urn: str) -> dict:
        token = await self._get_token("data:read data:write data:create")
        padded = urn + "=" * (-len(urn) % 4)

        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{APS_BASE}/modelderivative/v2/designdata/job",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "x-ads-force": "true",
                },
                json={
                    "input": {"urn": padded},
                    "output": {
                        "formats": [{"type": "svf2", "views": ["2d", "3d"]}]
                    },
                },
            )
            r.raise_for_status()
            return r.json()

    async def get_manifest(self, urn: str) -> dict:
        token = await self._get_token("data:read")
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{APS_BASE}/modelderivative/v2/designdata/{urn}/manifest",
                headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            return r.json()
