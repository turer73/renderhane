"""Private WSGI adapter; production entrypoint is Gunicorn behind TLS/access control.

No browser CORS and no cookie auth. Next verifies the session, admin and ownership;
this service independently checks its server-only bearer secret and scoped owner.
Never expose this service or its persistent volume directly to public customers.
"""
from __future__ import annotations

import hmac
import json
import os
import re
from pathlib import Path
from wsgiref.util import FileWrapper

from workshop_contract import MAX_BODY_BYTES, validate_submission
from workshop_store import OWNER_RE, WorkshopStore, canonical_json

REVISION_RE = re.compile(r"^/revisions/([0-9a-f-]{36})(?:/(retry|artifacts)(?:/([a-z0-9-]+))?)?$")


def make_app(store: WorkshopStore, token: str):
    if len(token) < 32:
        raise ValueError("RELIEF_WORKSHOP_TOKEN must contain at least 32 characters")

    def app(environ, start_response):
        def respond(status: int, body: dict):
            payload = canonical_json(body).encode()
            start_response(f"{status} { {200: 'OK', 201: 'Created', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 409: 'Conflict', 413: 'Content Too Large', 415: 'Unsupported Media Type', 503: 'Service Unavailable'}[status]}",
                           [("Content-Type", "application/json"), ("Cache-Control", "no-store"),
                            ("X-Content-Type-Options", "nosniff"), ("Content-Length", str(len(payload)))])
            return [payload]

        supplied = environ.get("HTTP_AUTHORIZATION", "")
        if not hmac.compare_digest(supplied.encode(), f"Bearer {token}".encode()):
            return respond(401, {"error": "unauthorized"})
        owner = environ.get("HTTP_X_RELIEF_OWNER", "")
        if not OWNER_RE.fullmatch(owner):
            return respond(401, {"error": "invalid_owner"})
        method, path = environ.get("REQUEST_METHOD"), environ.get("PATH_INFO", "")
        try:
            if method == "GET" and path == "/revisions":
                return respond(200, {"revisions": store.list(owner), "worker_online": store.online()})
            if method == "POST" and path == "/revisions":
                if environ.get("CONTENT_TYPE", "").split(";")[0] != "application/json":
                    return respond(415, {"error": "application_json_required"})
                try:
                    length = int(environ.get("CONTENT_LENGTH", "0"))
                except ValueError:
                    return respond(400, {"error": "invalid_content_length"})
                if not 0 < length <= MAX_BODY_BYTES:
                    return respond(413, {"error": "request_limit_4MB"})
                raw = environ["wsgi.input"].read(length)
                if len(raw) != length:
                    return respond(400, {"error": "truncated_request"})
                spec, payload = validate_submission(json.loads(raw))
                revision, created = store.submit(owner, spec, payload)
                return respond(201 if created else 200, {"revision": revision, "deduplicated": not created})
            match = REVISION_RE.fullmatch(path)
            if match:
                revision_id, action, artifact_name = match.groups()
                if method == "GET" and action is None:
                    revision = store.get(owner, revision_id)
                    return respond(200, {"revision": revision}) if revision else respond(404, {"error": "not_found"})
                if method == "POST" and action == "retry" and artifact_name is None:
                    if store.retry(owner, revision_id):
                        return respond(200, {"revision": store.get(owner, revision_id)})
                    return respond(409, {"error": "retry_unavailable"})
                if method == "GET" and action == "artifacts" and artifact_name:
                    artifact = store.artifact_path(owner, revision_id, artifact_name)
                    if artifact:
                        file_path, metadata = artifact
                        handle = file_path.open("rb")
                        start_response("200 OK", [("Content-Type", metadata["content_type"]),
                            ("Content-Length", str(metadata["bytes"])), ("Cache-Control", "no-store"),
                            ("X-Content-Type-Options", "nosniff"),
                            ("Content-Disposition", f'attachment; filename="{file_path.name}"'),
                            ("X-Artifact-SHA256", metadata["sha256"])])
                        return FileWrapper(handle)
            return respond(404, {"error": "not_found"})
        except (ValueError, TypeError, KeyError, UnicodeError) as exc:
            # Input errors are restricted to known contract messages. Never echo
            # arbitrary request text, internal file paths, or a Python traceback.
            message = str(exc)
            allowed = ("width must", "dimensions must", "all input layers", "relief_map must",
                       "silhouette must", "mask must", "white_mask must", "varnish_mask must",
                       "uv_artwork must", "canvas must", "PNG inputs", "queue_limit", "pilot_storage_limit")
            return respond(400, {"error": message if message.startswith(allowed) else "invalid_submission_or_artifact"})
        except Exception:
            return respond(503, {"error": "workshop_unavailable"})

    return app


def create_app():
    return make_app(WorkshopStore(Path(os.environ["RELIEF_WORKSHOP_DATA"])),
                    os.environ["RELIEF_WORKSHOP_TOKEN"])


if __name__ == "__main__":
    # Windows/local developer entrypoint only. It cannot bind a public interface.
    from wsgiref.simple_server import make_server
    with make_server("127.0.0.1", 8421, create_app()) as server:
        server.serve_forever()
