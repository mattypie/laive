from __future__ import absolute_import, print_function, unicode_literals

import json
import os
import tempfile
import unittest

from laive.control_surface import LaiveControlSurface
from laive.fake_live import FakeCInstance, FakeSong
from laive.protocol import create_request


class LaiveControlSurfaceTests(unittest.TestCase):
    def setUp(self):
        self.song = FakeSong()
        self.instance = FakeCInstance(self.song)
        self.surface = LaiveControlSurface(
            self.instance,
            auto_start_server=False,
        )

    def tearDown(self):
        self.surface.disconnect()

    def test_hello_and_capabilities(self):
        hello = self.surface.process_request(create_request("hello", request_id="hello-1"))
        capabilities = self.surface.process_request(create_request("capabilities", request_id="caps-1"))

        self.assertTrue(hello["ok"])
        self.assertEqual(hello["result"]["bridge"], "laive-remote-script")
        self.assertTrue(capabilities["result"]["create_track"])

    def test_writes_structured_log_file(self):
        with tempfile.TemporaryDirectory() as log_dir:
            previous = os.environ.get("LAIVE_LOG_DIR")
            os.environ["LAIVE_LOG_DIR"] = log_dir
            try:
                surface = LaiveControlSurface(
                    self.instance,
                    auto_start_server=False,
                )
                try:
                    surface.process_request(create_request("hello", request_id="log-1"))
                finally:
                    surface.disconnect()
            finally:
                if previous is None:
                    os.environ.pop("LAIVE_LOG_DIR", None)
                else:
                    os.environ["LAIVE_LOG_DIR"] = previous

            log_path = os.path.join(log_dir, "remote-script.jsonl")
            self.assertTrue(os.path.exists(log_path))
            with open(log_path, "r") as handle:
                first_entry = json.loads(handle.readline())
            self.assertEqual(first_entry["component"], "remote-script")

    def test_get_song_and_tracks(self):
        song_response = self.surface.process_request(create_request("get", target="song", request_id="song-1"))
        arrangement_response = self.surface.process_request(
            create_request("get", target="arrangement", request_id="arrangement-1")
        )
        tracks_response = self.surface.process_request(create_request("get", target="tracks", request_id="tracks-1"))

        self.assertEqual(song_response["result"]["tempo"], 124.0)
        self.assertEqual(arrangement_response["result"]["arrangement_position_beats"], 0.0)
        self.assertEqual(len(tracks_response["result"]), 5)
        self.assertEqual(tracks_response["result"][0]["name"], "Drums")
        self.assertEqual(tracks_response["result"][1]["arrangement_clips"][0]["location"], "arrangement")

    def test_mutations_change_fake_live_state(self):
        set_tempo = self.surface.process_request(
            create_request("set", target="song.tempo", arguments={"value": 130}, request_id="tempo-1")
        )
        create_track = self.surface.process_request(
            create_request("call", target="create_track", arguments={"type": "midi", "name": "Lead"}, request_id="track-1")
        )
        create_clip = self.surface.process_request(
            create_request(
                "call",
                target="create_clip",
                arguments={"track_id": "track:2", "slot_index": 0, "length_beats": 8, "name": "Bassline"},
                request_id="clip-1",
            )
        )
        clip_id = create_clip["result"]["clip"]["id"]
        insert_notes = self.surface.process_request(
            create_request(
                "call",
                target="insert_notes",
                arguments={
                    "clip_id": clip_id,
                    "notes": [
                        {"pitch": 48, "startBeats": 0.0, "durationBeats": 1.0, "velocity": 100}
                    ],
                },
                request_id="notes-1",
            )
        )
        replace_notes = self.surface.process_request(
            create_request(
                "call",
                target="replace_notes",
                arguments={
                    "clip_id": clip_id,
                    "notes": [
                        {"pitch": 55, "startBeats": 2.0, "durationBeats": 0.5, "velocity": 90}
                    ],
                },
                request_id="notes-2",
            )
        )

        self.assertEqual(set_tempo["result"]["value"], 130.0)
        self.assertEqual(self.song.tempo, 130.0)
        self.assertEqual(create_track["result"]["track"]["name"], "Lead")
        self.assertEqual(len(self.song.tracks), 3)
        self.assertEqual(create_clip["result"]["clip"]["name"], "Bassline")
        self.assertEqual(insert_notes["result"]["note_count"], 1)
        self.assertEqual(replace_notes["result"]["note_count"], 1)
        created_clip = self.song.tracks[1].clip_slots[0].clip
        self.assertEqual(created_clip.last_add_new_notes_payload[0][1], 2.0)
        self.assertEqual(created_clip.last_add_new_notes_payload[0][2], 0.5)
        self.assertEqual(created_clip.last_remove_notes_by_id_payload, [1])
        created_note = self.song.tracks[1].clip_slots[0].clip.notes[0]
        self.assertEqual(created_note["pitch"], 55)
        self.assertEqual(created_note["start_time"], 2.0)
        self.assertEqual(created_note["duration"], 0.5)

    def test_browser_queries_and_load_item(self):
        browser_tree = self.surface.process_request(
            create_request("get", target="browser.tree", request_id="browser-tree-1")
        )
        browser_items = self.surface.process_request(
            create_request(
                "call",
                target="get_browser_items",
                arguments={"path": "instruments"},
                request_id="browser-items-1",
            )
        )
        load_item = self.surface.process_request(
            create_request(
                "call",
                target="load_browser_item",
                arguments={"track_id": "track:1", "path": "instruments/Operator"},
                request_id="browser-load-1",
            )
        )

        self.assertTrue(browser_tree["ok"])
        self.assertEqual(browser_tree["result"]["roots"][0]["name"], "Instruments")
        self.assertEqual(browser_items["result"]["items"][0]["name"], "Operator")
        self.assertEqual(load_item["result"]["item"]["name"], "Operator")
        self.assertEqual(self.song.tracks[0].devices[-1].name, "Operator")

    def test_select_track_updates_song_view(self):
        response = self.surface.process_request(
            create_request(
                "call",
                target="select_track",
                arguments={"track_id": "track:2"},
                request_id="track-select-1",
            )
        )

        self.assertTrue(response["ok"])
        self.assertEqual(response["result"]["track"]["id"], "track:2")
        self.assertEqual(self.song.view.selected_track, self.song.tracks[1])

    def test_select_track_routes_to_live_adapter(self):
        response = self.surface.process_request(
            create_request(
                "call",
                target="select_track",
                arguments={"track_id": "track:2"},
                request_id="select-track-1",
            )
        )

        self.assertTrue(response["ok"])
        self.assertEqual(response["result"]["track"]["id"], "track:2")
        self.assertEqual(self.song.view.selected_track, self.song.tracks[1])

    def test_mixer_and_routing_mutations(self):
        send_response = self.surface.process_request(
            create_request(
                "set",
                target="track.send",
                arguments={"track_id": "track:1", "send_index": 0, "value": 0.4},
                request_id="track-send-1",
            )
        )
        monitor_response = self.surface.process_request(
            create_request(
                "set",
                target="track.monitoring_state",
                arguments={"track_id": "track:1", "monitoring_state": "off"},
                request_id="track-monitor-1",
            )
        )
        routing_response = self.surface.process_request(
            create_request(
                "set",
                target="track.routing",
                arguments={"track_id": "track:1", "output_routing_type": "sends_only"},
                request_id="track-routing-1",
            )
        )

        self.assertEqual(send_response["result"]["track"]["sends"][0]["value"], 0.4)
        self.assertEqual(monitor_response["result"]["track"]["monitoring_state"], 2)
        self.assertEqual(
            routing_response["result"]["track"]["output_routing_type"]["identifier"],
            "sends_only",
        )

    def test_arrangement_mutations(self):
        arrangement_response = self.surface.process_request(
            create_request(
                "set",
                target="song.arrangement",
                arguments={
                    "arrangement_position_beats": 16,
                    "loop_enabled": True,
                    "loop_start_beats": 8,
                    "loop_length_beats": 32,
                },
                request_id="arrangement-set-1",
            )
        )

        self.assertTrue(arrangement_response["ok"])
        self.assertEqual(arrangement_response["result"]["song"]["arrangement_position_beats"], 16.0)
        self.assertTrue(self.song.loop)
        self.assertEqual(self.song.current_song_time, 16.0)
        self.assertEqual(self.song.loop_start, 8.0)
        self.assertEqual(self.song.loop_length, 32.0)

    def test_session_launch_controls(self):
        create_clip = self.surface.process_request(
            create_request(
                "call",
                target="create_clip",
                arguments={"track_id": "track:1", "slot_index": 0, "length_beats": 4, "name": "Hook"},
                request_id="clip-launch-1",
            )
        )
        clip_id = create_clip["result"]["clip"]["id"]

        launch_clip = self.surface.process_request(
            create_request(
                "call",
                target="launch_clip",
                arguments={"clip_id": clip_id},
                request_id="clip-launch-2",
            )
        )
        stop_track = self.surface.process_request(
            create_request(
                "call",
                target="stop_track_clips",
                arguments={"track_id": "track:1"},
                request_id="clip-launch-3",
            )
        )
        launch_scene = self.surface.process_request(
            create_request(
                "call",
                target="launch_scene",
                arguments={"scene_id": "scene:1"},
                request_id="clip-launch-4",
            )
        )

        self.assertTrue(launch_clip["result"]["clip"]["is_playing"])
        self.assertEqual(stop_track["result"]["track"]["id"], "track:1")
        self.assertFalse(stop_track["result"]["track"]["session_clips"][0]["is_playing"])
        self.assertEqual(launch_scene["result"]["scene"]["id"], "scene:1")

    def test_session_clip_edit_controls(self):
        slot_class = self.song.tracks[0].clip_slots[0].__class__
        self.song.tracks[0].clip_slots[0].create_clip(4)
        self.song.tracks[0].clip_slots[0].clip.name = "Original"

        rename_clip = self.surface.process_request(
            create_request(
                "call",
                target="rename_clip",
                arguments={"clip_id": "clip:session:track:1:slot:1", "name": "Renamed"},
                request_id="clip-edit-1",
            )
        )
        duplicate_clip = self.surface.process_request(
            create_request(
                "call",
                target="duplicate_clip",
                arguments={"clip_id": "clip:session:track:1:slot:1", "target_slot_index": 1},
                request_id="clip-edit-2",
            )
        )
        move_clip = self.surface.process_request(
            create_request(
                "call",
                target="move_session_clip",
                arguments={"clip_id": "clip:session:track:1:slot:2", "target_slot_index": 2},
                request_id="clip-edit-3",
            )
        )
        set_loop = self.surface.process_request(
            create_request(
                "call",
                target="set_clip_loop_or_length",
                arguments={"clip_id": "clip:session:track:1:slot:1", "length_beats": 8, "loop_end_beats": 8},
                request_id="clip-edit-4",
            )
        )
        delete_clip = self.surface.process_request(
            create_request(
                "call",
                target="delete_clip",
                arguments={"clip_id": "clip:session:track:1:slot:3"},
                request_id="clip-edit-5",
            )
        )

        self.assertEqual(rename_clip["result"]["clip"]["name"], "Renamed")
        self.assertEqual(duplicate_clip["result"]["clip"]["id"], "clip:session:track:1:slot:2")
        self.assertEqual(move_clip["result"]["clip"]["id"], "clip:session:track:1:slot:3")
        self.assertEqual(set_loop["result"]["clip"]["length_beats"], 8.0)
        self.assertEqual(delete_clip["result"]["clip_id"], "clip:session:track:1:slot:3")

    def test_arrangement_clip_creation_and_duplication_controls(self):
        self.song.tracks[0].clip_slots[0].create_clip(4)
        self.song.tracks[0].clip_slots[0].clip.name = "Source Clip"

        create_arrangement_clip = self.surface.process_request(
            create_request(
                "call",
                target="create_arrangement_clip",
                arguments={
                    "track_id": "track:1",
                    "start_beats": 8,
                    "length_beats": 8,
                    "name": "Arrange Verse",
                },
                request_id="arrangement-create-1",
            )
        )
        duplicate_to_arrangement = self.surface.process_request(
            create_request(
                "call",
                target="duplicate_clip_to_arrangement",
                arguments={
                    "clip_id": "clip:session:track:1:slot:1",
                    "destination_beats": 24,
                    "target_track_id": "track:1",
                },
                request_id="arrangement-duplicate-1",
            )
        )

        self.assertTrue(create_arrangement_clip["ok"])
        self.assertEqual(
            create_arrangement_clip["result"]["clip"]["id"],
            "clip:arrangement:track:1:index:1",
        )
        self.assertEqual(create_arrangement_clip["result"]["clip"]["start_beats"], 8.0)
        self.assertEqual(create_arrangement_clip["result"]["clip"]["end_beats"], 16.0)
        self.assertEqual(create_arrangement_clip["result"]["clip"]["name"], "Arrange Verse")

        self.assertTrue(duplicate_to_arrangement["ok"])
        self.assertEqual(
            duplicate_to_arrangement["result"]["clip"]["id"],
            "clip:arrangement:track:1:index:2",
        )
        self.assertEqual(duplicate_to_arrangement["result"]["clip"]["start_beats"], 24.0)
        self.assertEqual(duplicate_to_arrangement["result"]["clip"]["name"], "Source Clip")

        move_arrangement_clip = self.surface.process_request(
            create_request(
                "call",
                target="move_arrangement_clip",
                arguments={
                    "clip_id": "clip:arrangement:track:1:index:2",
                    "destination_beats": 32,
                },
                request_id="arrangement-move-1",
            )
        )

        self.assertTrue(move_arrangement_clip["ok"])
        self.assertEqual(
            move_arrangement_clip["result"]["clip"]["id"],
            "clip:arrangement:track:1:index:2",
        )
        self.assertEqual(move_arrangement_clip["result"]["clip"]["start_beats"], 32.0)
        self.assertEqual(move_arrangement_clip["result"]["clip"]["end_beats"], 36.0)


if __name__ == "__main__":
    unittest.main()
