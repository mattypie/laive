import { EventEmitter } from "node:events";
import net from "node:net";

import {
  assertValidProtocolMessage,
  createStructuredLogger,
  createJsonLineParser,
  createRequest,
  stringifyJsonLine
} from "../../../common/src/index.js";

export class BridgeClient extends EventEmitter {
  constructor({
    host = "127.0.0.1",
    port = 7612,
    clientId = "laive-bridge-client",
    socketFactory = null,
    logger = null
  } = {}) {
    super();
    this.host = host;
    this.port = port;
    this.clientId = clientId;
    this.socketFactory = socketFactory;
    this.logger = logger ?? createStructuredLogger({ component: "bridge-client" });
    this.socket = null;
    this.pending = new Map();
  }

  async connect() {
    if (this.socket) {
      return;
    }

    this.socket = this.socketFactory
      ? this.socketFactory({ host: this.host, port: this.port })
      : net.createConnection({ host: this.host, port: this.port });
    this.socket.setKeepAlive?.(true, 30_000);
    this.logger.info("bridge_client.connecting", {
      host: this.host,
      port: this.port,
      clientId: this.clientId
    });
    const parser = createJsonLineParser({
      onMessage: (message) => {
        assertValidProtocolMessage(message);
        if (message.type === "event") {
          this.logger.debug("bridge_client.event", {
            topic: message.topic,
            requestId: message.request_id ?? null
          });
          this.emit("event", message);
          this.emit(`event:${message.topic}`, message);
          return;
        }

        const pending = this.pending.get(message.request_id);
        if (pending) {
          this.pending.delete(message.request_id);
          if (message.ok) {
            this.logger.debug("bridge_client.response", {
              requestId: message.request_id,
              ok: true
            });
            pending.resolve(message);
          } else {
            this.logger.warn("bridge_client.response_error", {
              requestId: message.request_id,
              errorMessage: message.error_message ?? "Unknown bridge error"
            });
            pending.reject(new Error(message.error_message ?? "Unknown bridge error"));
          }
        }
      }
    });

    this.socket.on("data", (chunk) => parser.push(Buffer.from(chunk)));
    this.socket.on("end", () => parser.end());
    this.socket.on("error", (error) => {
      this.logger.error("bridge_client.socket_error", error);
      if (this.listenerCount("error") > 0) {
        this.emit("error", error);
      }
    });
    this.socket.on("close", () => {
      const pendingEntries = [...this.pending.entries()];
      this.pending.clear();
      this.socket = null;
      if (pendingEntries.length > 0) {
        this.logger.warn("bridge_client.closed_with_pending_requests", {
          pendingRequestCount: pendingEntries.length
        });
        for (const [, pending] of pendingEntries) {
          pending.reject(new Error("Bridge connection closed"));
        }
      } else {
        this.logger.info("bridge_client.closed", {
          clientId: this.clientId
        });
      }
      this.emit("close");
    });

    await onceConnected(this.socket);
    this.logger.info("bridge_client.connected", {
      host: this.host,
      port: this.port,
      clientId: this.clientId
    });
  }

  async disconnect() {
    if (!this.socket) {
      return;
    }
    const socket = this.socket;
    this.socket = null;
    this.logger.info("bridge_client.disconnecting", {
      clientId: this.clientId
    });
    await new Promise((resolve) => {
      socket.once("close", resolve);
      socket.end();
    });
  }

  async request(operation, target = null, args = {}, { dryRun = false } = {}) {
    if (!this.socket) {
      throw new Error("Bridge client is not connected");
    }

    const message = createRequest({
      operation,
      target,
      arguments: args,
      dryRun,
      clientId: this.clientId
    });

    this.logger.debug("bridge_client.request", {
      requestId: message.request_id,
      operation,
      target,
      dryRun
    });
    this.socket.write(stringifyJsonLine(message));

    return new Promise((resolve, reject) => {
      this.pending.set(message.request_id, { resolve, reject });
    });
  }

  async subscribe(topic) {
    return this.request("subscribe", topic);
  }

  async unsubscribe(topic) {
    return this.request("unsubscribe", topic);
  }
}

function onceConnected(socket) {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
}
