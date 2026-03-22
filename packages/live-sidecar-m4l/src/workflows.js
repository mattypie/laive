export const sidecarWorkflows = Object.freeze({
  snapshotSelectionContext: {
    description: "Read selected track, clip, and device context from the official Live API.",
    requiredCapabilities: ["objectObservation"],
    queryPaths: ["live_set view selected_track", "live_set view detail_clip"]
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

  return {
    name,
    description: workflow.description,
    steps: []
  };
}
