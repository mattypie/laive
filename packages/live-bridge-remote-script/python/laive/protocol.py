from __future__ import absolute_import, print_function, unicode_literals

import json
import uuid
from datetime import datetime, timezone


PROTOCOL_VERSION = "0.1.0"


class RequestError(Exception):
    def __init__(self, code, message):
        super(RequestError, self).__init__(message)
        self.code = code


def create_request(operation, target=None, arguments=None, dry_run=False, client_id="laive-client", request_id=None):
    return {
        "type": "request",
        "request_id": request_id or str(uuid.uuid4()),
        "timestamp": iso_now(),
        "client_id": client_id,
        "operation": operation,
        "target": target,
        "arguments": arguments or {},
        "dry_run": bool(dry_run),
    }


def make_response(request_id, ok=True, result=None, error_code=None, error_message=None, live_version=None):
    return {
        "type": "response",
        "request_id": request_id,
        "timestamp": iso_now(),
        "ok": bool(ok),
        "result": result,
        "error_code": error_code,
        "error_message": error_message,
        "bridge_version": PROTOCOL_VERSION,
        "live_version": live_version,
    }


def make_error_response(request_id, error_code, error_message, live_version=None):
    return make_response(
        request_id=request_id,
        ok=False,
        result=None,
        error_code=error_code,
        error_message=error_message,
        live_version=live_version,
    )


def make_event(topic, payload=None):
    return {
        "type": "event",
        "topic": topic,
        "payload": payload or {},
        "timestamp": iso_now(),
    }


def encode_json_line(payload):
    return json.dumps(payload, separators=(",", ":")) + "\n"


class JsonLineParser(object):
    def __init__(self):
        self._buffer = ""

    def push(self, chunk):
        if isinstance(chunk, bytes):
            chunk = chunk.decode("utf-8")
        self._buffer += chunk
        messages = []
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            line = line.strip()
            if not line:
                continue
            messages.append(json.loads(line))
        return messages


def iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
