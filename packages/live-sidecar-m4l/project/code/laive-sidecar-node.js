"use strict";

function createCapabilityMap(overrides) {
  return Object.assign(
    {
      noteEditing: true,
      objectObservation: true,
      deviceIntrospection: true,
      realtimeAnalysis: false,
      browserInsertion: false
    },
    overrides || {}
  );
}

const workflows = {
  snapshotSelectionContext: {
    description: "Read selected track, clip, and device context from the official Live API.",
    requiredCapabilities: ["objectObservation"],
    queryPaths: ["live_set view selected_track", "live_set view detail_clip"]
  },
  transformSelectedClip: {
    description:
      "Rewrite the currently selected MIDI clip with note-level transforms such as transposition, velocity scaling, and timing shifts.",
    requiredCapabilities: ["objectObservation", "noteEditing"],
    target: "clip:selected"
  },
  replaceClipNotes: {
    description: "Apply a note payload to a target MIDI clip in a single sidecar transaction.",
    requiredCapabilities: ["noteEditing"],
    target: "clip"
  },
  observeDeviceParameters: {
    description: "Start a parameter observation stream for the selected device.",
    requiredCapabilities: ["objectObservation", "deviceIntrospection"],
    target: "device:selected"
  },
  captureDeviceSnapshot: {
    description:
      "Capture a parameter snapshot for a selected or explicitly targeted device so it can be restored later.",
    requiredCapabilities: ["objectObservation", "deviceIntrospection"],
    target: "device"
  },
  applyDeviceSnapshot: {
    description: "Apply a previously captured device-parameter snapshot back onto a target device.",
    requiredCapabilities: ["deviceIntrospection"],
    target: "device"
  }
};

function loadMaxApi() {
  try {
    return require("max-api");
  } catch (_error) {
    return {
      post(message) {
        process.stdout.write(String(message) + "\n");
      },
      outlet(message) {
        process.stdout.write(JSON.stringify(message) + "\n");
      },
      addHandlers(handlers) {
        global.__laiveMaxHandlers = handlers;
      }
    };
  }
}

const Max = loadMaxApi();
const capabilities = createCapabilityMap();

function emit(type, payload) {
  Max.outlet({
    type,
    payload
  });
}

function normalizeMessage(rawMessage) {
  if (typeof rawMessage !== "string") {
    return rawMessage;
  }

  const trimmed = rawMessage.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed === "hello" || trimmed === "capabilities" || trimmed === "list_workflows") {
    return {
      command: trimmed
    };
  }

  const looseCommandMatch = trimmed.match(/^\{\s*command\s*:\s*([A-Za-z0-9_:-]+)\s*\}$/);
  if (looseCommandMatch) {
    return {
      command: looseCommandMatch[1]
    };
  }

  return rawMessage;
}

async function handleMessage(rawMessage) {
  let message = normalizeMessage(rawMessage);

  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch (error) {
      emit("error", {
        code: "invalid_json",
        message: error.message
      });
      return;
    }
  }

  switch (message.command) {
    case "hello":
      emit("hello", {
        runtime: "laive-sidecar-node",
        version: "0.1.0"
      });
      return;
    case "capabilities":
      emit("capabilities", capabilities);
      return;
    case "list_workflows":
      emit("query", {
        workflows: Object.keys(workflows).map(function (name) {
          return {
            name: name,
            description: workflows[name].description
          };
        })
      });
      return;
    default:
      emit("error", {
        code: "unknown_command",
        message: "Unknown command: " + message.command
      });
  }
}

Max.post("laive-sidecar Node for Max source loaded");
Max.addHandlers({
  message: handleMessage,
  hello: function () {
    return handleMessage("hello");
  },
  capabilities: function () {
    return handleMessage("capabilities");
  },
  list_workflows: function () {
    return handleMessage("list_workflows");
  },
  bang: function () {
    emit("hello", {
      runtime: "laive-sidecar-node",
      version: "0.1.0"
    });
  }
});
