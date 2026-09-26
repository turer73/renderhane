from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from workshop_http import make_app
from workshop_store import WorkshopStore

TOKEN = "x" * 32


def _call(
    app: Any,
    method: str,
    path: str,
    *,
    body: bytes = b"",
    token: str | None = TOKEN,
    owner: str | None = "alice",
    content_type: str | None = "application/json",
    content_length: str | None = None,
) -> tuple[int, dict[str, str], bytes]:
    captured: dict[str, Any] = {}

    def start_response(status: str, headers: list[tuple[str, str]], _exc: Any = None) -> None:
        captured["status"] = status
        captured["headers"] = headers

    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "SERVER_NAME": "test",
        "SERVER_PORT": "80",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(body),
        "wsgi.errors": io.StringIO(),
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
        "CONTENT_LENGTH": content_length if content_length is not None else str(len(body)),
    }
    if token is not None:
        environ["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    if owner is not None:
        environ["HTTP_X_RELIEF_OWNER"] = owner
    if content_type is not None:
        environ["CONTENT_TYPE"] = content_type
    response = app(environ, start_response)
    try:
        payload = b"".join(response)
    finally:
        close = getattr(response, "close", None)
        if close:
            close()
    return int(captured["status"].split()[0]), dict(captured["headers"]), payload


def _png(array: np.ndarray) -> str:
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _uploaded_layers(*, relief_8bit: bool = False) -> dict[str, str]:
    size = 32
    relief = np.full((size, size), 255 if relief_8bit else 65535,
                     dtype=np.uint8 if relief_8bit else np.uint16)
    mask = np.full((size, size), 255, dtype=np.uint8)
    return {"relief_map": _png(relief), "mask": _png(mask)}


def _submission(**changes: Any) -> bytes:
    value: dict[str, Any] = {"acknowledge_candidate": True, "layers": _uploaded_layers()}
    value.update(changes)
    return json.dumps(value).encode("utf-8")


def test_http_rejects_bad_token_missing_owner_content_type_and_body_limit(tmp_path: Path) -> None:
    app = make_app(WorkshopStore(tmp_path / "workshop"), TOKEN)
    body = _submission()

    assert _call(app, "GET", "/revisions", token="wrong" * 8)[0] == 401
    assert _call(app, "GET", "/revisions", owner=None)[0] == 401
    assert _call(app, "POST", "/revisions", body=body, content_type="text/plain")[0] == 415
    status, _headers, response = _call(
        app, "POST", "/revisions", body=b"{}", content_length=str(4_000_001)
    )
    assert status == 413
    assert json.loads(response) == {"error": "request_limit_4MB"}


def test_http_rejects_invalid_contract_inputs_without_echoing_request(tmp_path: Path) -> None:
    app = make_app(WorkshopStore(tmp_path / "workshop"), TOKEN)
    incomplete_semantic = np.ones((32, 32), dtype=np.uint16)
    incomplete_semantic[0, 0] = 0
    cases = [
        ("eight_bit_height", {"layers": _uploaded_layers(relief_8bit=True)}),
        ("nonfinite", {"recipe": {"width_mm": float("nan")}}),
        ("unknown_field", {"unknown": "must-not-be-echoed"}),
        ("unknown_sample", {"sample": "unknown-sample"}),
        ("mixed_sample_layer", {"sample": "calibration-v1", "layers": {}}),
        ("semantic_missing_pair", {
            "layers": {**_uploaded_layers(), "geometry_semantic_ids": _png(np.ones((32, 32), dtype=np.uint16))},
            "semantic_manifest": {"schema_version": 1, "regions": [{"id": 1, "name": "base"}]},
        }),
        ("semantic_silhouette_coverage_gap", {
            "layers": {
                **_uploaded_layers(),
                "uv_artwork": _png(np.zeros((32, 32, 3), dtype=np.uint8)),
                "geometry_semantic_ids": _png(incomplete_semantic),
                "artwork_semantic_ids": _png(incomplete_semantic),
            },
            "semantic_manifest": {"schema_version": 1, "regions": [{"id": 1, "name": "base"}]},
        }),
        ("bad_png", {"layers": {"relief_map": base64.b64encode(b"\x89PNG\r\n\x1a\nbad-not-an-image-data").decode(), "mask": _uploaded_layers()["mask"]}}),
    ]
    for label, changes in cases:
        status, _headers, response = _call(app, "POST", "/revisions", body=_submission(**changes))
        assert status == 400, label
        assert "must-not-be-echoed" not in response.decode("utf-8")


def test_http_owner_isolation_and_stdout_never_contains_bearer_secret(
    tmp_path: Path, capsys: Any
) -> None:
    secret = "S" * 32
    app = make_app(WorkshopStore(tmp_path / "workshop"), secret)
    status, _headers, body = _call(
        app,
        "POST",
        "/revisions",
        token=secret,
        owner="alice",
        body=json.dumps({"sample": "calibration-v1", "acknowledge_candidate": True}).encode(),
    )
    assert status == 201
    revision_id = json.loads(body)["revision"]["id"]
    status, _headers, body = _call(
        app, "GET", f"/revisions/{revision_id}", token=secret, owner="bob"
    )
    assert status == 404
    assert json.loads(body) == {"error": "not_found"}
    captured = capsys.readouterr()
    assert secret not in captured.out
    assert secret not in captured.err
