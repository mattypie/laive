import test from "node:test";
import assert from "node:assert/strict";

import { createSidecarAdapter } from "../src/optional-adapters.js";

function createStateAdapter() {
  let loadedTrackId = null;

  return {
    markLoaded(trackId) {
      loadedTrackId = trackId;
    },
    async listTracks() {
      return [{ id: "track:1", name: "Track 1" }];
    },
    async getTrackDetails(trackId) {
      return {
        id: trackId,
        name: trackId,
        devices:
          loadedTrackId === trackId
            ? [{ id: `${trackId}:device:sidecar`, name: "laive-sidecar" }]
            : []
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
