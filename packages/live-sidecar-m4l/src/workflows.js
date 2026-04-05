export const sidecarWorkflows = Object.freeze({
  snapshotSelectionContext: {
    description: "Read selected track, clip, and device context from the official Live API.",
    requiredCapabilities: ["objectObservation"],
    queryPaths: ["live_set view selected_track", "live_set view detail_clip"]
  },
  transformSelectedClip: {
    description:
      "Rewrite the currently selected MIDI clip with note-level transforms such as transposition, velocity scaling, and timing shifts.",
    requiredCapabilities: ["objectObservation", "noteEditing"],
    target: "clip:selected",
    mutationShape: {
      transposeSemitones: 12,
      velocityScale: 0.85,
      velocityOffset: -8,
      startOffsetBeats: 0.25,
      durationScale: 0.9
    }
  },
  replaceClipNotes: {
    description: "Apply a note payload to a target MIDI clip in a single sidecar transaction.",
    requiredCapabilities: ["noteEditing"],
    target: "clip",
    mutationShape: {
      clipId: "clip:session:track=1:slot=0",
      notes: [
        {
          pitch: 60,
          startBeats: 0,
          durationBeats: 1,
          velocity: 100,
          mute: false
        }
      ]
    }
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
});

export function listWorkflows() {
  return Object.entries(sidecarWorkflows).map(([name, workflow]) => ({
    name,
    description: workflow.description,
    requiredCapabilities: workflow.requiredCapabilities
  }));
}

export function getWorkflow(name) {
  return sidecarWorkflows[name] ?? null;
}

export function materializeWorkflow(name, parameters = {}) {
  const workflow = getWorkflow(name);
  if (!workflow) {
    throw new Error(`Unknown sidecar workflow: ${name}`);
  }

  if (name === "snapshotSelectionContext") {
    return {
      name,
      description: workflow.description,
      steps: workflow.queryPaths.map((queryPath) => ({
        kind: "query",
        queryPath
      }))
    };
  }

  if (name === "replaceClipNotes") {
    return {
      name,
      description: workflow.description,
      steps: [
        {
          kind: "mutation",
          target: workflow.target,
          payload: {
            clipId: parameters.clipId ?? workflow.mutationShape.clipId,
            notes: parameters.notes ?? workflow.mutationShape.notes
          }
        }
      ]
    };
  }

  if (name === "transformSelectedClip") {
    return {
      name,
      description: workflow.description,
      steps: [
        {
          kind: "mutation",
          target: workflow.target,
          payload: {
            transposeSemitones: parameters.transposeSemitones ?? workflow.mutationShape.transposeSemitones,
            velocityScale: parameters.velocityScale ?? workflow.mutationShape.velocityScale,
            velocityOffset: parameters.velocityOffset ?? workflow.mutationShape.velocityOffset,
            startOffsetBeats: parameters.startOffsetBeats ?? workflow.mutationShape.startOffsetBeats,
            durationScale: parameters.durationScale ?? workflow.mutationShape.durationScale
          }
        }
      ]
    };
  }

  if (name === "observeDeviceParameters") {
    return {
      name,
      description: workflow.description,
      steps: [
        {
          kind: "observe",
          target: parameters.target ?? workflow.target
        }
      ]
    };
  }

  if (name === "captureDeviceSnapshot") {
    return {
      name,
      description: workflow.description,
      steps: [
        {
          kind: "query",
          queryPath: "live_set view selected_track"
        },
        {
          kind: "query",
          queryPath: "live_set view detail_device"
        }
      ]
    };
  }

  if (name === "applyDeviceSnapshot") {
    return {
      name,
      description: workflow.description,
      steps: [
        {
          kind: "mutation",
          target: workflow.target,
          payload: {
            snapshot: parameters.snapshot ?? null,
            trackId: parameters.trackId ?? null,
            deviceId: parameters.deviceId ?? null
          }
        }
      ]
    };
  }

  return {
    name,
    description: workflow.description,
    steps: []
  };
}
