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
import logging
import os
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from backend.utils.db import hostname, resolve_token

router = APIRouter()
logger = logging.getLogger(__name__)

_GENIE_SPACE_ID: str = os.environ.get("GENIE_SPACE_ID", "")
_POLL_INTERVAL_S: float = 1.5
_POLL_MAX_ATTEMPTS: int = 40  # Poll-loop budget; total request time is bounded below.
_API_TIMEOUT_S: float = 30.0
_MAX_TOTAL_WAIT_S: float = _API_TIMEOUT_S + (_POLL_INTERVAL_S * _POLL_MAX_ATTEMPTS)


class GenieRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class GenieResponse(BaseModel):
    answer: str
    conversation_id: str


async def _api(
    token: str,
    method: str,
    path: str,
    body: Optional[dict] = None,
    *,
    timeout_s: Optional[float] = None,
) -> dict:
    host = hostname()
    url = f"https://{host}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        timeout = _API_TIMEOUT_S if timeout_s is None else timeout_s
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
            resp = await client.request(method, url, headers=headers, json=body)
            resp.raise_for_status()
            if not resp.content:
                return {}
            return resp.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        upstream_status = exc.response.status_code
        mapped_status = (
            504 if upstream_status == 504
            else 502 if upstream_status >= 500
            else upstream_status
        )
        logger.warning(
            "genie.api_error method=%s path=%s status=%d body=%s",
            method, path, upstream_status, detail,
        )
        raise HTTPException(
            status_code=mapped_status,
            detail="Genie API request failed.",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("genie.api_transport_error method=%s path=%s error=%s", method, path, str(exc)[:300])
        raise HTTPException(
            status_code=502,
            detail="Genie API request failed.",
        ) from exc


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
    deadline = time.monotonic() + _MAX_TOTAL_WAIT_S

    def _remaining_timeout() -> float:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise HTTPException(status_code=504, detail="Genie response timed out.")
        return min(_API_TIMEOUT_S, remaining)

    if req.conversation_id:
        data = await _api(
            token, "POST",
            f"/api/2.0/genie/spaces/{space_id}/conversations/{req.conversation_id}/messages",
            {"content": req.message},
            timeout_s=_remaining_timeout(),
        )
        conversation_id = req.conversation_id
        message_id = data.get("id")
    else:
        data = await _api(
            token, "POST",
            f"/api/2.0/genie/spaces/{space_id}/start-conversation",
            {"content": req.message},
            timeout_s=_remaining_timeout(),
        )
        conversation_id = data.get("conversation_id")
        message_id = data.get("message_id")

    if not conversation_id or not message_id:
        logger.warning("genie.unexpected_response keys=%s", sorted(data.keys()))
        raise HTTPException(
            status_code=502,
            detail="Genie returned unexpected empty or malformed response",
        )

    poll_path = (
        f"/api/2.0/genie/spaces/{space_id}"
        f"/conversations/{conversation_id}/messages/{message_id}"
    )

    for _ in range(_POLL_MAX_ATTEMPTS):
        msg = await _api(token, "GET", poll_path, timeout_s=_remaining_timeout())
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
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        await asyncio.sleep(min(_POLL_INTERVAL_S, remaining))

    raise HTTPException(status_code=504, detail="Genie response timed out.")
