import { EventEmitter } from "node:events";
import net from "node:net";

import {
  assertValidProtocolMessage,
  createJsonLineParser,
  createRequest,
  stringifyJsonLine
} from "../../../common/src/index.js";

export class BridgeClient extends EventEmitter {
  constructor({
    host = "127.0.0.1",
    port = 7612,
    clientId = "laive-bridge-client",
    socketFactory = null
  } = {}) {
    super();
    this.host = host;
    this.port = port;
    this.clientId = clientId;
    this.socketFactory = socketFactory;
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
    const parser = createJsonLineParser({
      onMessage: (message) => {
        assertValidProtocolMessage(message);
        if (message.type === "event") {
          this.emit("event", message);
          this.emit(`event:${message.topic}`, message);
          return;
        }

        const pending = this.pending.get(message.request_id);
        if (pending) {
          this.pending.delete(message.request_id);
          if (message.ok) {
            pending.resolve(message);
          } else {
            pending.reject(new Error(message.error_message ?? "Unknown bridge error"));
          }
        }
      }
    });

    this.socket.on("data", (chunk) => parser.push(Buffer.from(chunk)));
    this.socket.on("end", () => parser.end());
    this.socket.on("error", (error) => {
      if (this.listenerCount("error") > 0) {
        this.emit("error", error);
      }
    });
    this.socket.on("close", () => {
      this.socket = null;
      this.emit("close");
    });

    await onceConnected(this.socket);
  }

  async disconnect() {
    if (!this.socket) {
      return;
    }
    const socket = this.socket;
    this.socket = null;
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
