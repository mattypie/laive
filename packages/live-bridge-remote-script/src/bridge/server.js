import { EventEmitter } from "node:events";
import net from "node:net";

import {
  assertValidProtocolMessage,
  createEvent,
  createJsonLineParser,
  createResponse,
  stringifyJsonLine
} from "../../../common/src/index.js";

export class BridgeServer extends EventEmitter {
  constructor({ runtime, host = "127.0.0.1", port = 7612 } = {}) {
    super();
    this.runtime = runtime;
    this.host = host;
    this.port = port;
    this.server = null;
    this.clients = new Set();
    this.subscriptions = new Map();
    this.boundRuntimeEventHandler = (event) => {
      const topic = event.topic ?? "state.changed";
      this.broadcastEvent(createEvent({ topic, payload: event.payload ?? {} }));
    };
  }

  async start() {
    if (this.server) {
      return this.address();
    }

    this.runtime.on("event", this.boundRuntimeEventHandler);

    this.server = net.createServer((socket) => this.attachClient(socket));

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });

    return this.address();
  }

  async stop() {
    if (!this.server) {
      return;
    }

    this.runtime.off("event", this.boundRuntimeEventHandler);

    for (const socket of this.clients) {
      socket.destroy();
    }

    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
    this.clients.clear();
    this.subscriptions.clear();
  }

  address() {
    const address = this.server?.address();
    return typeof address === "object" && address
      ? { host: address.address, port: address.port }
      : { host: this.host, port: this.port };
  }

  attachClient(socket) {
    this.clients.add(socket);
    socket.setEncoding("utf8");
    this.broadcastEvent(
      createEvent({
        topic: "bridge.connected",
        payload: {
          client_count: this.clients.size
        }
      }),
      new Set([socket])
    );

    const parser = createJsonLineParser({
      onMessage: (message) => {
        this.handleMessage(socket, message).catch((error) => {
          const response = createResponse({
            requestId: message.request_id ?? "unknown",
            ok: false,
            errorCode: "runtime_error",
            errorMessage: error.message,
            liveVersion: this.runtime.liveVersion
          });
          socket.write(stringifyJsonLine(response));
        });
      }
    });

    socket.on("data", (chunk) => parser.push(Buffer.from(chunk)));
    socket.on("end", () => parser.end());
    socket.on("error", () => {
      this.detachClient(socket);
    });
    socket.on("close", () => {
      this.detachClient(socket);
    });
  }

  detachClient(socket) {
    this.clients.delete(socket);
    for (const subscribers of this.subscriptions.values()) {
      subscribers.delete(socket);
    }
  }

  async handleMessage(socket, message) {
    assertValidProtocolMessage(message);

    if (message.operation === "subscribe") {
      this.subscribe(socket, message.target, message.request_id);
      return;
    }

    if (message.operation === "unsubscribe") {
      this.unsubscribe(socket, message.target, message.request_id);
      return;
    }

    const result = await this.runtime.execute(message);
    const response = createResponse({
      requestId: message.request_id,
      ok: true,
      result,
      liveVersion: this.runtime.liveVersion
    });

    socket.write(stringifyJsonLine(response));
  }

  subscribe(socket, topic, requestId) {
    const subscribers = this.subscriptions.get(topic) ?? new Set();
    subscribers.add(socket);
    this.subscriptions.set(topic, subscribers);

    socket.write(
      stringifyJsonLine(
        createResponse({
          requestId,
          ok: true,
          result: {
            subscribed: topic
          },
          liveVersion: this.runtime.liveVersion
        })
      )
    );
  }

  unsubscribe(socket, topic, requestId) {
    const subscribers = this.subscriptions.get(topic);
    subscribers?.delete(socket);

    socket.write(
      stringifyJsonLine(
        createResponse({
          requestId,
          ok: true,
          result: {
            unsubscribed: topic
          },
          liveVersion: this.runtime.liveVersion
        })
      )
    );
  }

  broadcastEvent(event, recipients = this.resolveRecipients(event.topic)) {
    for (const socket of recipients) {
      socket.write(stringifyJsonLine(event));
    }
  }

  resolveRecipients(topic) {
    if (!topic) {
      return this.clients;
    }
    return this.subscriptions.get(topic) ?? new Set();
  }
}
