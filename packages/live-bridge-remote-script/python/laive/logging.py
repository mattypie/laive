from __future__ import absolute_import, print_function, unicode_literals

import json
import os
import threading
import time


DEFAULT_LOG_DIR = os.path.join(os.path.expanduser("~"), ".local", "share", "laive", "logs")


def resolve_log_dir():
    override = os.environ.get("LAIVE_LOG_DIR")
    if override:
        return override
    return DEFAULT_LOG_DIR


class StructuredFileLogger(object):
    def __init__(self, component, filename=None, fallback=None, log_dir=None):
        self._component = component
        self._filename = filename or "{0}.jsonl".format(component)
        self._fallback = fallback
        self._log_dir = log_dir or resolve_log_dir()
        self._path = os.path.join(self._log_dir, self._filename)
        self._lock = threading.Lock()
        self._disabled = False

    @property
    def path(self):
        return self._path

    def __call__(self, message, level="info", **fields):
        if self._disabled:
            return None

        entry = {
            "timestamp": _timestamp(),
            "level": level,
            "component": self._component,
            "thread": threading.current_thread().name,
        }
        if isinstance(message, dict):
            entry.update(message)
        else:
            entry["message"] = message

        if fields:
            entry.update(fields)

        encoded = json.dumps(_normalize(entry), sort_keys=True)
        try:
            self._ensure_directory()
            with self._lock:
                handle = open(self._path, "a")
                try:
                    handle.write(encoded)
                    handle.write("\n")
                finally:
                    handle.close()
        except Exception:
            self._disabled = True

        if self._fallback:
            try:
                self._fallback(entry.get("message", encoded))
            except Exception:
                return None
        return None

    def info(self, message, **fields):
        return self(message, level="info", **fields)

    def debug(self, message, **fields):
        return self(message, level="debug", **fields)

    def warn(self, message, **fields):
        return self(message, level="warn", **fields)

    def error(self, message, **fields):
        return self(message, level="error", **fields)

    def _ensure_directory(self):
        if os.path.isdir(self._log_dir):
            return
        os.makedirs(self._log_dir)


def _timestamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _normalize(value):
    if isinstance(value, dict):
        result = {}
        for key, entry in value.items():
            result[key] = _normalize(entry)
        return result
    if isinstance(value, (list, tuple)):
        return [_normalize(entry) for entry in value]
    if isinstance(value, BaseException):
        return {
            "type": value.__class__.__name__,
            "message": str(value),
        }
    return value
