from __future__ import absolute_import, print_function, unicode_literals

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

    def test_get_song_and_tracks(self):
        song_response = self.surface.process_request(create_request("get", target="song", request_id="song-1"))
        tracks_response = self.surface.process_request(create_request("get", target="tracks", request_id="tracks-1"))

        self.assertEqual(song_response["result"]["tempo"], 124.0)
        self.assertEqual(len(tracks_response["result"]), 2)
        self.assertEqual(tracks_response["result"][0]["name"], "Drums")

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


if __name__ == "__main__":
    unittest.main()
