import test from "node:test";
import assert from "node:assert/strict";

import { createSidecarAdapter } from "../src/optional-adapters.js";

function createStateAdapter() {
  let loadedTrackId = null;
  const selectedClip = {
    id: "clip:session:track:1:slot:1",
    location: "session",
    isMidi: true,
    notes: [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, mute: false },
      { pitch: 64, start_time: 1, duration: 0.5, velocity: 90, mute: false }
    ]
  };
  const devices = [
    {
      id: "device:track:1:1",
      name: "Operator",
      parameters: [
        { id: "parameter:device:track:1:1:1", name: "Volume", value: 0.4, displayValue: "-8.0 dB" },
        { id: "parameter:device:track:1:1:2", name: "Algorithm", value: 2, displayValue: "Alg. 3", isQuantized: true }
      ]
    }
  ];

  return {
    markLoaded(trackId) {
      loadedTrackId = trackId;
    },
    async listTracks() {
      return [{ id: "track:1", name: "Track 1" }];
    },
    async getSelectedContext() {
      return {
        selectedClipId: selectedClip.id,
        selectedClipLocation: "session",
        track: { id: "track:1", name: "Track 1" },
        clip: selectedClip
      };
    },
    async getTrackDetails(trackId) {
      return {
        id: trackId,
        name: trackId,
        track: { id: trackId, name: "Track 1" },
        sessionClips: [selectedClip],
        devices:
          loadedTrackId === trackId
            ? [{ id: `${trackId}:device:sidecar`, name: "laive-sidecar" }, ...devices]
            : devices
      };
    },
    async refreshState() {
      return { ok: true };
    }
  };
}

test("createSidecarAdapter.ensureOnTrack prefers native browser loading when sidecar is discoverable", async () => {
  const stateAdapter = createStateAdapter();
  const bridgeAdapter = {
    async selectTrack() {
      return { ok: true };
    },
    async getBrowserTree() {
      return {
        roots: [{ path: "user_library", name: "User Library" }]
      };
    },
    async getBrowserItems(payload = {}) {
      if (payload.path === "user_library") {
        return {
          path: payload.path,
          item: { name: "User Library", path: "user_library", is_folder: true, is_loadable: false },
          items: [
            {
              name: "laive-sidecar",
              path: "user_library/laive-sidecar",
              uri: "browser:user_library:laive-sidecar",
              is_folder: false,
              is_loadable: true
            }
          ]
        };
      }
      return { path: payload.path, items: [] };
    },
    async loadBrowserItem(payload) {
      stateAdapter.markLoaded(payload.trackId);
      return {
        item: {
          uri: payload.uri,
          path: payload.path
        }
      };
    }
  };
  const uiAutomationAdapter = {
    async getStatus() {
      return { configured: true, workflows: [] };
    },
    async executeWorkflow() {
      throw new Error("UI fallback should not run when native browser loading succeeds");
    }
  };

  const adapter = createSidecarAdapter({
    stateAdapter,
    bridgeAdapter,
    uiAutomationAdapter
  });

  const result = await adapter.ensureOnTrack({ trackId: "track:1" });

  assert.equal(result.method, "bridge_browser_load_item");
  assert.equal(result.active, true);
  assert.equal(result.activeInstance.trackId, "track:1");
  assert.deepEqual(result.warnings, []);
});

test("createSidecarAdapter.transformSelectedClip rewrites the selected clip notes", async () => {
  const stateAdapter = createStateAdapter();
  const bridgeAdapter = {
    async replaceNotes(payload, options) {
      return {
        clip: { id: payload.clipId, noteCount: payload.notes.length },
        noteCount: payload.notes.length,
        payload,
        options
      };
    }
  };

  const adapter = createSidecarAdapter({
    stateAdapter,
    bridgeAdapter
  });

  stateAdapter.markLoaded("track:1");
  const result = await adapter.transformSelectedClip({
    transposeSemitones: 12,
    velocityScale: 0.5,
    startOffsetBeats: 0.25
  });

  assert.equal(result.workflow, "transformSelectedClip");
  assert.equal(result.selectedClipId, "clip:session:track:1:slot:1");
  assert.equal(result.transformedNotes[0].pitch, 72);
  assert.equal(result.transformedNotes[0].velocity, 50);
  assert.equal(result.transformedNotes[0].startBeats, 0.25);
});

test("createSidecarAdapter.captureDeviceSnapshot resolves an explicit target device", async () => {
  const stateAdapter = createStateAdapter();
  stateAdapter.markLoaded("track:1");

  const adapter = createSidecarAdapter({
    stateAdapter,
    bridgeAdapter: {}
  });

  const result = await adapter.captureDeviceSnapshot({
    trackId: "track:1",
    deviceName: "Operator"
  });

  assert.equal(result.workflow, "captureDeviceSnapshot");
  assert.equal(result.snapshot.trackId, "track:1");
  assert.equal(result.snapshot.deviceName, "Operator");
  assert.equal(result.snapshot.parameters.length, 2);
});

test("createSidecarAdapter.applyDeviceSnapshot restores captured parameter values", async () => {
  const stateAdapter = createStateAdapter();
  stateAdapter.markLoaded("track:1");
  const calls = [];
  const bridgeAdapter = {
    async setParameter(payload, options) {
      calls.push({ payload, options });
      return { ok: true };
    }
  };

  const adapter = createSidecarAdapter({
    stateAdapter,
    bridgeAdapter
  });

  const result = await adapter.applyDeviceSnapshot({
    snapshot: {
      trackId: "track:1",
      deviceId: "device:track:1:1",
      parameters: [
        { id: "parameter:device:track:1:1:1", name: "Volume", value: 0.2 },
        { id: "parameter:device:track:1:1:2", name: "Algorithm", value: 4 }
      ]
    }
  });

  assert.equal(result.workflow, "applyDeviceSnapshot");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.parameterId, "parameter:device:track:1:1:1");
  assert.equal(calls[1].payload.value, 4);
});

test("createSidecarAdapter.ensureOnTrack falls back to UI browser search when native resolution misses", async () => {
  const stateAdapter = createStateAdapter();
  const bridgeAdapter = {
    async selectTrack() {
      return { ok: true };
    },
    async getBrowserTree() {
      return {
        roots: [{ path: "midi_effects", name: "MIDI Effects" }]
      };
    },
    async getBrowserItems(payload = {}) {
      return {
        path: payload.path,
        item: { name: "MIDI Effects", path: payload.path, is_folder: true, is_loadable: false },
        items: []
      };
    }
  };
  const uiAutomationAdapter = {
    async getStatus() {
      return {
        configured: true,
        workflows: []
      };
    },
    async executeWorkflow(name, parameters) {
      stateAdapter.markLoaded("track:1");
      return {
        workflow: name,
        parameters
      };
    }
  };

  const adapter = createSidecarAdapter({
    stateAdapter,
    bridgeAdapter,
    uiAutomationAdapter
  });

  const result = await adapter.ensureOnTrack({ trackId: "track:1" });

  assert.equal(result.method, "ui_browser_search_and_load");
  assert.equal(result.active, true);
  assert.equal(result.activeInstance.trackId, "track:1");
  assert.deepEqual(result.warnings, []);
});
