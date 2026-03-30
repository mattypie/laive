import test from "node:test";
import assert from "node:assert/strict";

import {
  applyEvent,
  applySnapshot,
  createInitialState,
  createStateEngine,
  getArrangementTrackDetails,
  getArrangementSummary,
  getSelectedContext,
  makeDeviceId,
  makeParameterId,
  makeSessionClipId,
  makeTrackId,
  replayTrace,
  summarizeProject
} from "../src/index.js";

function createRuntimeSnapshot() {
  return {
    observed_at: "2026-03-22T18:00:00.000Z",
    bridge_version: "0.1.0",
    live_version: "12.1.10",
    application: {
      version: "12.1.10",
      major_version: 12,
      minor_version: 1,
      bugfix_version: 10,
      mode: "live_set"
    },
    song: {
      name: "Agent Test Set",
      tempo: 128,
      time_signature_numerator: 4,
      time_signature_denominator: 4,
      is_playing: true,
      is_recording: false,
      metronome: false,
      current_song_time: 12,
      loop: {
        enabled: true,
        start_beats: 8,
        length_beats: 16
      }
    },
    selection: {
      selected_track: {
        section: "visible",
        index: 0
      },
      selected_scene_index: 1
    },
    capabilities: {
      runtime_version: "bridge-0.1",
      supported_commands: ["get_song_state", "set_tempo", "create_clip"],
      supported_events: ["transport.changed", "track.updated", "clip.updated"],
      features: {
        browserLoad: false
      }
    },
    scenes: [
      { index: 0, name: "Intro" },
      { index: 1, name: "Drop" }
    ],
    tracks: [
      {
        section: "visible",
        index: 0,
        name: "Drums",
        armed: true,
        session_clips: [
          {
            location: "session",
            slot_index: 0,
            name: "Kick",
            is_midi: true,
            is_playing: false,
            note_count: 8
          },
          {
            location: "session",
            slot_index: 1,
            name: "Groove",
            is_midi: true,
            is_playing: true,
            note_count: 32
          }
        ],
        arrangement_clips: [
          {
            location: "arrangement",
            arrangement_index: 0,
            name: "Verse Drums",
            start_beats: 0,
            end_beats: 16
          }
        ],
        devices: [
          {
            index: 0,
            name: "Drum Rack",
            class_name: "InstrumentGroupDevice",
            type: "instrument",
            parameters: [
              {
                index: 0,
                name: "LFO Waveform",
                value: 1,
                min: 0,
                max: 2,
                is_quantized: true,
                value_items: ["Sine", "Square", "Random"],
                display_value: "Square"
              }
            ]
          }
        ]
      },
      {
        section: "return",
        index: 0,
        name: "Reverb",
        devices: []
      },
      {
        id: "track:master",
        section: "master",
        index: 0,
        name: "Master",
        devices: []
      }
    ]
  };
}

test("applySnapshot normalizes runtime data into a stable project graph", () => {
  const initialState = createInitialState({
    observedAt: "2026-03-22T17:59:00.000Z"
  });
  const state = applySnapshot(initialState, createRuntimeSnapshot());

  assert.equal(state.song.name, "Agent Test Set");
  assert.equal(state.meta.bridgeVersion, "0.1.0");
  assert.deepEqual(state.visibleTrackIds, [makeTrackId("visible", 0)]);
  assert.deepEqual(state.returnTrackIds, [makeTrackId("return", 0)]);
  assert.equal(state.masterTrackId, "track:master");
  assert.equal(state.sceneOrder.length, 2);
  assert.ok(state.clips[makeSessionClipId(makeTrackId("visible", 0), 1)].isPlaying);
  const parameter = state.parameters[makeParameterId(makeDeviceId(makeTrackId("visible", 0), 0), 0)];
  assert.equal(parameter.displayValue, "Square");
  assert.equal(parameter.isQuantized, true);
  assert.deepEqual(parameter.valueItems, ["Sine", "Square", "Random"]);
  assert.deepEqual(parameter.allowedValues, [
    { value: 0, label: "Sine" },
    { value: 1, label: "Square" },
    { value: 2, label: "Random" }
  ]);

  const summary = summarizeProject(state);
  assert.equal(summary.counts.playingClips, 1);
  assert.equal(summary.counts.returnTracks, 1);
  assert.equal(summary.counts.masterTracks, 1);
  assert.equal(summary.counts.arrangementClips, 1);
  assert.equal(summary.song.tempo, 128);
  assert.equal(summary.song.currentSongTime, 12);
  assert.equal(summary.song.loopStartBeats, 8);
  assert.equal(summary.song.loopLengthBeats, 16);

  const arrangement = getArrangementSummary(state);
  assert.equal(arrangement.counts.arrangementClips, 1);
  assert.equal(arrangement.song.loopEnabled, true);
  assert.equal(arrangement.arrangementClips[0].startBeats, 0);
  const arrangementTrack = getArrangementTrackDetails(state, makeTrackId("visible", 0));
  assert.equal(arrangementTrack.arrangementClips.length, 1);
  assert.equal(arrangementTrack.arrangementClips[0].name, "Verse Drums");
});

test("applyEvent and state engine queries update selected context and clip state", () => {
  const engine = createStateEngine();
  engine.applySnapshot(createRuntimeSnapshot());

  engine.applyEvent({
    event: "selection.changed",
    observed_at: "2026-03-22T18:01:00.000Z",
    payload: {
      selected_track_id: makeTrackId("visible", 0),
      selected_clip_id: makeSessionClipId(makeTrackId("visible", 0), 1),
      selected_device_id: makeDeviceId(makeTrackId("visible", 0), 0),
      selected_scene_index: 1
    }
  });

  engine.applyEvent({
    event: "clip.updated",
    observed_at: "2026-03-22T18:02:00.000Z",
    payload: {
      track_id: makeTrackId("visible", 0),
      location: "session",
      slot_index: 1,
      name: "Groove",
      is_playing: false,
      is_triggered: true
    }
  });

  const context = engine.query.getSelectedContext();
  assert.equal(context.track.name, "Drums");
  assert.equal(context.clip.name, "Groove");
  assert.equal(context.device.name, "Drum Rack");

  const details = engine.query.getTrackDetails(makeTrackId("visible", 0));
  assert.equal(details.sessionClips.length, 2);
  assert.equal(
    details.sessionClips.find((clip) => clip.slotIndex === 1).isTriggered,
    true
  );
});

test("replayTrace rehydrates state from snapshot and event history", () => {
  const snapshot = createRuntimeSnapshot();
  const replay = replayTrace([
    {
      type: "snapshot",
      observed_at: "2026-03-22T18:00:00.000Z",
      payload: snapshot
    },
    {
      type: "event",
      event: "transport.changed",
      observed_at: "2026-03-22T18:03:00.000Z",
      payload: {
        tempo: 132,
        is_playing: false
      }
    },
    {
      type: "event",
      event: "state.dirty",
      observed_at: "2026-03-22T18:04:00.000Z",
      payload: {
        paths: ["song.tracks.visible.0"]
      }
    }
  ]);

  assert.equal(replay.history.length, 3);
  assert.equal(replay.state.song.tempo, 132);
  assert.equal(replay.state.song.isPlaying, false);
  assert.deepEqual(replay.state.meta.dirtyPaths, ["song.tracks.visible.0"]);

  const selectionContext = getSelectedContext(replay.state);
  assert.equal(selectionContext.selection.selectedSceneId, "scene:1");
});
