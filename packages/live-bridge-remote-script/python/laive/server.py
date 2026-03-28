from __future__ import absolute_import, print_function, unicode_literals

import socket
import threading

from .protocol import JsonLineParser, encode_json_line, make_event


class RemoteCommandServer(object):
    def __init__(self, host, port, request_handler, logger=None):
        self._host = host
        self._port = port
        self._request_handler = request_handler
        self._logger = logger
        self._socket = None
        self._thread = None
        self._running = False
        self._clients = set()
        self._subscriptions = {}

    @property
    def running(self):
        return self._running

    @property
    def address(self):
        if self._socket:
            try:
                return self._socket.getsockname()
            except Exception:  # pragma: no cover
                return (self._host, self._port)
        return (self._host, self._port)

    @property
    def client_count(self):
        return len(self._clients)

    def start(self):
        if self._running:
            return self.address

        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self._socket.bind((self._host, self._port))
        self._socket.listen(4)
        self._socket.settimeout(0.5)
        self._running = True
        self._log("remote server listening", event="bridge.server_started", host=self._host, port=self._port)
        self._thread = threading.Thread(target=self._serve, name="laive-remote-script-server")
        self._thread.daemon = True
        self._thread.start()
        return self.address

    def stop(self):
        self._running = False
        self._log("remote server stopping", event="bridge.server_stopping", client_count=self.client_count)
        if self._socket is not None:
            try:
                self._socket.close()
            except Exception:
                pass
            self._socket = None
        for client in list(self._clients):
            try:
                client.close()
            except Exception:
                pass
        self._clients.clear()

    def broadcast_event(self, topic, payload):
        event = make_event(topic, payload)
        recipients = self._subscriptions.get(topic) or self._clients
        encoded = encode_json_line(event).encode("utf-8")
        self._log(
            "broadcasting event",
            level="debug",
            event="bridge.broadcast_event",
            topic=topic,
            recipient_count=len(recipients),
        )
        for client in list(recipients):
            try:
                client.sendall(encoded)
            except Exception:
                self._drop_client(client)

    def _serve(self):  # pragma: no cover - exercised indirectly in Live, not unit tests
        while self._running:
            try:
                client, _address = self._socket.accept()
            except socket.timeout:
                continue
            except Exception:
                continue

            client.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            self._clients.add(client)
            self._log(
                "client connected",
                event="bridge.client_connected",
                client_count=self.client_count,
            )
            worker = threading.Thread(target=self._handle_client, args=(client,))
            worker.daemon = True
            worker.start()

    def _handle_client(self, client):  # pragma: no cover - exercised indirectly
        parser = JsonLineParser()
        try:
            while self._running:
                chunk = client.recv(8192)
                if not chunk:
                    break
                for request in parser.push(chunk):
                    self._log(
                        "request received",
                        level="debug",
                        event="bridge.request",
                        operation=request.get("operation"),
                        target=request.get("target"),
                        request_id=request.get("request_id"),
                    )
                    if request.get("operation") == "subscribe":
                        self._subscriptions.setdefault(request.get("target"), set()).add(client)
                        response = self._request_handler(
                            {
                                "request_id": request.get("request_id"),
                                "operation": "health",
                            }
                        )
                    elif request.get("operation") == "unsubscribe":
                        subscribers = self._subscriptions.get(request.get("target"), set())
                        subscribers.discard(client)
                        response = self._request_handler(
                            {
                                "request_id": request.get("request_id"),
                                "operation": "health",
                            }
                        )
                    else:
                        response = self._request_handler(request)
                    client.sendall(encode_json_line(response).encode("utf-8"))
        except Exception as error:
            self._log("client handler error", level="error", event="bridge.client_error", error=error)
        finally:
            self._drop_client(client)

    def _drop_client(self, client):
        self._clients.discard(client)
        for subscribers in self._subscriptions.values():
            subscribers.discard(client)
        try:
            client.close()
        except Exception:
            pass
        self._log("client disconnected", event="bridge.client_disconnected", client_count=self.client_count)

    def _log(self, message, level="info", **fields):
        if not self._logger:
            return
        try:
            self._logger(message, level=level, **fields)
        except Exception:
            return
