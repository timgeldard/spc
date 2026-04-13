"""
Databricks Genie proxy router.

Requires the GENIE_SPACE_ID environment variable (the AI/BI Genie space that
answers SPC quality questions). The logged-in user's forwarded access token
is passed through so Genie enforces workspace-level authorisation.

API flow:
  1. No conversation_id  → POST /api/2.0/genie/spaces/{sid}/start-conversation
  2. With conversation_id → POST /api/2.0/genie/spaces/{sid}/conversations/{cid}/messages
  3. Poll GET             /api/2.0/genie/spaces/{sid}/conversations/{cid}/messages/{mid}
     until status is COMPLETED, FAILED, or CANCELLED.
"""
import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from backend.utils.db import hostname, resolve_token

router = APIRouter()
logger = logging.getLogger(__name__)

_GENIE_SPACE_ID: str = os.environ.get("GENIE_SPACE_ID", "")
_POLL_INTERVAL_S: float = 1.5
_POLL_MAX_ATTEMPTS: int = 40  # ~60 s maximum wait


class GenieRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class GenieResponse(BaseModel):
    answer: str
    conversation_id: str


def _api_sync(token: str, method: str, path: str, body: Optional[dict] = None) -> dict:
    host = hostname()
    url = f"https://{host}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        logger.warning(
            "genie.api_error method=%s path=%s status=%d body=%s",
            method, path, exc.code, detail,
        )
        raise HTTPException(
            status_code=exc.code,
            detail="Genie API request failed.",
        ) from exc


async def _api(token: str, method: str, path: str, body: Optional[dict] = None) -> dict:
    return await asyncio.to_thread(_api_sync, token, method, path, body)


def _extract_text(msg: dict) -> str:
    """Pull plain text out of a completed Genie message payload."""
    for att in msg.get("attachments") or []:
        # Current Genie format: {"text": {"content": "..."}}
        text_obj = att.get("text")
        if isinstance(text_obj, dict):
            text = text_obj.get("content") or text_obj.get("text") or ""
            if text:
                return str(text)
        # Legacy format: {"content": {"text": "..."}} or {"content": "..."}
        content = att.get("content")
        if isinstance(content, dict):
            text = content.get("text") or ""
            if text:
                return str(text)
        if isinstance(content, str) and content:
            return content
    return msg.get("error") or "No response received from Genie."


@router.post("/genie/message", response_model=GenieResponse)
async def genie_message(
    req: GenieRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if not _GENIE_SPACE_ID:
        raise HTTPException(
            status_code=503,
            detail="GENIE_SPACE_ID is not configured on this deployment.",
        )

    token = resolve_token(x_forwarded_access_token, authorization)
    space_id = _GENIE_SPACE_ID

    if req.conversation_id:
        data = await _api(
            token, "POST",
            f"/api/2.0/genie/spaces/{space_id}/conversations/{req.conversation_id}/messages",
            {"content": req.message},
        )
        conversation_id = req.conversation_id
        message_id = data["id"]
    else:
        data = await _api(
            token, "POST",
            f"/api/2.0/genie/spaces/{space_id}/start-conversation",
            {"content": req.message},
        )
        conversation_id = data["conversation_id"]
        message_id = data["message_id"]

    poll_path = (
        f"/api/2.0/genie/spaces/{space_id}"
        f"/conversations/{conversation_id}/messages/{message_id}"
    )

    for _ in range(_POLL_MAX_ATTEMPTS):
        msg = await _api(token, "GET", poll_path)
        status = msg.get("status", "")
        if status == "COMPLETED":
            return GenieResponse(answer=_extract_text(msg), conversation_id=conversation_id)
        if status in ("FAILED", "CANCELLED"):
            logger.warning(
                "genie.message_%s conversation_id=%s message_id=%s error=%s",
                status.lower(), conversation_id, message_id, msg.get("error", ""),
            )
            raise HTTPException(
                status_code=500,
                detail=f"Genie could not produce a response (status: {status.lower()}).",
            )
        await asyncio.sleep(_POLL_INTERVAL_S)

    raise HTTPException(status_code=504, detail="Genie response timed out.")
