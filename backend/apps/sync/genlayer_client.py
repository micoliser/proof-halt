"""
Read-only GenLayer JSON-RPC client (studionet).

Decision D4 (IMPLEMENTATION_PLAN.md §15): the backend talks to GenLayer from
Python. We build `gen_call` requests directly with `requests` and use
`genlayer-py` only for calldata encode/decode, which keeps this client
read-only, dependency-light at runtime, and trivially mockable in tests.

This module must only ever *read*. Halt decisions live on-chain.
"""

from __future__ import annotations

import itertools
import logging
import time
from typing import Any, Iterable

import requests
from django.conf import settings
from genlayer_py.abi import calldata
from genlayer_py.abi.transactions import serialize

logger = logging.getLogger(__name__)

# Studionet returns -32006 when a client is rate limited; HTTP 429 is the
# proxy-level equivalent.
RATE_LIMIT_RPC_CODE = -32006
RETRYABLE_STATUS = (429, 500, 502, 503, 504)


class GenLayerError(RuntimeError):
    """Transport or RPC-level failure talking to GenLayer."""


class ContractCallError(GenLayerError):
    """The view executed but reverted (e.g. `Protocol does not exist`)."""


class HaltModuleReader:
    """Typed read wrapper over the Halt Module view ABI (§3.2)."""

    def __init__(
        self,
        rpc_url: str | None = None,
        contract_address: str | None = None,
        reader_address: str | None = None,
        timeout: float | None = None,
        throttle_seconds: float | None = None,
        max_retries: int | None = None,
        session: requests.Session | None = None,
    ) -> None:
        self.rpc_url = rpc_url or settings.GENLAYER_RPC_URL
        self.contract_address = (
            contract_address or settings.HALT_MODULE_ADDRESS or ""
        ).strip()
        self.reader_address = reader_address or settings.GENLAYER_READER_ADDRESS
        self.timeout = (
            settings.GENLAYER_RPC_TIMEOUT if timeout is None else float(timeout)
        )
        self.throttle_seconds = (
            settings.GENLAYER_RPC_THROTTLE_SECONDS
            if throttle_seconds is None
            else float(throttle_seconds)
        )
        self.max_retries = (
            settings.GENLAYER_RPC_MAX_RETRIES if max_retries is None else int(max_retries)
        )
        self._session = session or requests.Session()
        self._ids = itertools.count(1)
        self._last_call_at = 0.0

    # -- transport ---------------------------------------------------------

    def _throttle(self) -> None:
        if self.throttle_seconds <= 0:
            return
        elapsed = time.monotonic() - self._last_call_at
        if self._last_call_at and elapsed < self.throttle_seconds:
            time.sleep(self.throttle_seconds - elapsed)

    def _encode_call(self, method: str, args: Iterable[Any] | None) -> str:
        payload: dict[str, Any] = {"": method}
        arg_list = list(args or [])
        if arg_list:
            payload["args"] = arg_list
        return serialize([calldata.encode(payload), b"\x00"])

    def _rpc(self, method: str, params: list[Any]) -> Any:
        body = {
            "jsonrpc": "2.0",
            "id": next(self._ids),
            "method": method,
            "params": params,
        }
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            self._throttle()
            try:
                response = self._session.post(
                    self.rpc_url, json=body, timeout=self.timeout
                )
            except requests.RequestException as exc:
                last_error = GenLayerError(f"RPC transport error: {exc}")
            else:
                self._last_call_at = time.monotonic()
                if response.status_code in RETRYABLE_STATUS:
                    last_error = GenLayerError(
                        f"RPC HTTP {response.status_code} from {self.rpc_url}"
                    )
                else:
                    if response.status_code >= 400:
                        raise GenLayerError(
                            f"RPC HTTP {response.status_code}: {response.text[:400]}"
                        )
                    try:
                        envelope = response.json()
                    except ValueError as exc:
                        raise GenLayerError(f"RPC returned non-JSON: {exc}") from exc

                    error = envelope.get("error")
                    if error:
                        code = error.get("code") if isinstance(error, dict) else None
                        message = (
                            error.get("message") if isinstance(error, dict) else str(error)
                        )
                        if code == RATE_LIMIT_RPC_CODE:
                            last_error = GenLayerError(f"RPC rate limited: {message}")
                        else:
                            raise ContractCallError(f"RPC error {code}: {message}")
                    else:
                        return envelope.get("result")

            backoff = min(2**attempt * max(self.throttle_seconds, 0.2), 8.0)
            logger.warning(
                "genlayer rpc retry %s/%s (%s); sleeping %.2fs",
                attempt,
                self.max_retries,
                last_error,
                backoff,
            )
            self._last_call_at = time.monotonic()
            if attempt < self.max_retries:
                time.sleep(backoff)

        raise last_error or GenLayerError("RPC failed with no error recorded")

    def call_view(self, method: str, args: Iterable[Any] | None = None) -> Any:
        """Execute a read-only view call and return the decoded result."""
        if not self.contract_address:
            raise GenLayerError(
                "HALT_MODULE_ADDRESS is not configured; cannot read from chain"
            )
        params = [
            {
                "type": "read",
                "to": self.contract_address,
                "from": self.reader_address,
                "data": self._encode_call(method, args),
                "transaction_hash_variant": "latest-nonfinal",
            }
        ]
        result = self._rpc("gen_call", params)
        return _decode_result(result, method)

    # -- typed views (§3.2) ------------------------------------------------

    def get_protocol_count(self) -> int:
        return int(self.call_view("get_protocol_count") or 0)

    def get_case_count(self) -> int:
        return int(self.call_view("get_case_count") or 0)

    def get_case_event_count(self) -> int:
        return int(self.call_view("get_case_event_count") or 0)

    def get_protocol(self, protocol_id: int) -> dict:
        return _as_dict(self.call_view("get_protocol", [int(protocol_id)]))

    def get_case(self, case_id: int) -> dict:
        return _as_dict(self.call_view("get_case", [int(case_id)]))

    def get_case_event(self, event_id: int) -> dict:
        return _as_dict(self.call_view("get_case_event", [int(event_id)]))

    def list_protocols(self, offset: int, limit: int) -> list[dict]:
        return _as_dicts(self.call_view("list_protocols", [int(offset), int(limit)]))

    def list_cases(self, offset: int, limit: int) -> list[dict]:
        return _as_dicts(self.call_view("list_cases", [int(offset), int(limit)]))

    def list_protocol_cases(self, protocol_id: int, offset: int, limit: int) -> list[dict]:
        return _as_dicts(
            self.call_view(
                "list_protocol_cases", [int(protocol_id), int(offset), int(limit)]
            )
        )

    def list_case_events(self, case_id: int, offset: int, limit: int) -> list[dict]:
        return _as_dicts(
            self.call_view(
                "list_case_events", [int(case_id), int(offset), int(limit)]
            )
        )

    def is_action_allowed(self, protocol_id: int, action: str) -> bool:
        return bool(self.call_view("is_action_allowed", [int(protocol_id), str(action)]))


def _decode_result(result: Any, method: str) -> Any:
    if result is None:
        raise GenLayerError(f"{method}: RPC returned no result")
    if isinstance(result, dict):
        # Some node builds wrap the payload; unwrap the known keys.
        for key in ("data", "result", "returnValue"):
            if key in result:
                return _decode_result(result[key], method)
        return result
    if isinstance(result, (bytes, bytearray)):
        return calldata.decode(bytes(result))
    text = str(result)
    raw = text[2:] if text.lower().startswith("0x") else text
    try:
        return calldata.decode(bytes.fromhex(raw))
    except ValueError as exc:
        raise GenLayerError(f"{method}: could not decode result {text[:120]!r}") from exc


def _as_dict(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    raise GenLayerError(f"Expected a dict from view call, got {type(value).__name__}")


def _as_dicts(value: Any) -> list[dict]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [_as_dict(item) for item in value]
    raise GenLayerError(f"Expected a list from view call, got {type(value).__name__}")


def get_reader() -> HaltModuleReader:
    """Build a reader from Django settings."""
    return HaltModuleReader()
