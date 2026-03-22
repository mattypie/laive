import { StringDecoder } from "node:string_decoder";

export function stringifyJsonLine(message) {
  return `${JSON.stringify(message)}\n`;
}

export function createJsonLineParser({ onMessage }) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  return {
    push(chunk) {
      buffer += decoder.write(chunk);
      flushLines(onMessage);
    },
    end() {
      buffer += decoder.end();
      flushLines(onMessage, true);
    }
  };

  function flushLines(handler, flushRemainder = false) {
    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        handler(JSON.parse(line));
      }

      newlineIndex = buffer.indexOf("\n");
    }

    if (flushRemainder && buffer.trim().length > 0) {
      handler(JSON.parse(buffer.trim()));
      buffer = "";
    }
  }
}
