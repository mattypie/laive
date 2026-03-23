from __future__ import absolute_import, print_function, unicode_literals

import unittest

from laive.live_access import LiveSetAdapter
from laive.protocol import RequestError


class LegacyNoteSequenceTests(unittest.TestCase):
    def test_insert_notes_prefers_add_new_notes_with_extended_payload(self):
        clip = AddNewNotesClip()
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.insert_notes(
            "clip:session:track:1:slot:1",
            [
                {
                    "pitch": 64,
                    "startBeats": 1.0,
                    "durationBeats": 0.25,
                    "velocity": 96,
                }
            ],
        )

        self.assertEqual(result["note_count"], 1)
        self.assertEqual(
            clip.add_new_notes_payload,
            {
                "notes": [
                    {
                        "pitch": 64,
                        "start_time": 1.0,
                        "duration": 0.25,
                        "velocity": 96,
                        "mute": False,
                        "probability": 1.0,
                        "velocity_deviation": 0.0,
                        "release_velocity": 64,
                    }
                ]
            },
        )
        self.assertEqual(result["clip"]["note_count"], 1)
        self.assertEqual(result["clip"]["notes"][0]["pitch"], 64)

    def test_insert_notes_uses_direct_set_notes_when_add_new_notes_is_unavailable(self):
        clip = DirectSetNotesClip()
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.insert_notes(
            "clip:session:track:1:slot:1",
            [
                {
                    "pitch": 64,
                    "startBeats": 1.0,
                    "durationBeats": 0.25,
                    "velocity": 96,
                }
            ],
        )

        self.assertEqual(result["note_count"], 1)
        self.assertEqual(clip.set_notes_payload, ((64, 1.0, 0.25, 96, False),))
        self.assertEqual(result["clip"]["note_count"], 1)
        self.assertEqual(result["clip"]["notes"][0]["pitch"], 64)

    def test_insert_notes_uses_set_notes_sequence_when_available(self):
        clip = SetNotesSequenceClip()
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.insert_notes(
            "clip:session:track:1:slot:1",
            [
                {
                    "pitch": 60,
                    "startBeats": 0.0,
                    "durationBeats": 0.5,
                    "velocity": 100,
                }
            ],
        )

        self.assertEqual(result["note_count"], 1)
        self.assertEqual(clip.calls[0], ("set_notes",))
        self.assertEqual(
            clip.calls[1],
            ("notes", 1),
        )
        self.assertEqual(
            clip.calls[2],
            ("note", 60, 0.0, 0.5, 100, False),
        )
        self.assertEqual(clip.calls[3], ("done",))

    def test_replace_notes_prefers_remove_notes_by_id_plus_add_new_notes(self):
        clip = ReplaceByIdClip()
        clip.stored_notes = [
            {
                "pitch": 36,
                "start_time": 0.0,
                "duration": 1.0,
                "velocity": 100,
                "mute": False,
                "note_id": 9001,
            }
        ]
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.replace_notes(
            "clip:session:track:1:slot:1",
            [
                {
                    "pitch": 67,
                    "startBeats": 2.0,
                    "durationBeats": 0.5,
                    "velocity": 92,
                }
            ],
        )

        self.assertEqual(result["note_count"], 1)
        self.assertEqual(clip.calls[0], ("remove_notes_by_id", [9001]))
        self.assertEqual(clip.calls[1][0], "add_new_notes")
        self.assertEqual(len(clip.stored_notes), 1)
        self.assertEqual(clip.stored_notes[0]["pitch"], 67)
        self.assertEqual(result["clip"]["note_count"], 1)
        self.assertEqual(result["clip"]["notes"][0]["pitch"], 67)

    def test_replace_notes_uses_dict_remove_notes_extended_when_ids_are_missing(self):
        clip = RemoveNotesExtendedDictClip()
        clip.stored_notes = [
            {
                "pitch": 36,
                "start_time": 0.0,
                "duration": 1.0,
                "velocity": 100,
                "mute": False,
            }
        ]
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.replace_notes(
            "clip:session:track:1:slot:1",
            [
                {
                    "pitch": 67,
                    "startBeats": 2.0,
                    "durationBeats": 0.5,
                    "velocity": 92,
                }
            ],
        )

        self.assertEqual(result["note_count"], 1)
        self.assertEqual(
            clip.calls[0],
            ("remove_notes_extended", {"from_pitch": 0, "pitch_span": 128, "from_time": 0.0, "time_span": 4.0}),
        )
        self.assertEqual(clip.calls[1][0], "add_new_notes")
        self.assertEqual(len(clip.stored_notes), 1)
        self.assertEqual(clip.stored_notes[0]["pitch"], 67)

    def test_replace_notes_raises_when_clear_step_is_a_noop(self):
        clip = NoOpRemoveNotesExtendedClip()
        clip.stored_notes = [
            {
                "pitch": 36,
                "start_time": 0.0,
                "duration": 1.0,
                "velocity": 100,
                "mute": False,
            }
        ]
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        with self.assertRaises(RequestError) as context:
            adapter.replace_notes(
                "clip:session:track:1:slot:1",
                [
                    {
                        "pitch": 67,
                        "startBeats": 2.0,
                        "durationBeats": 0.5,
                        "velocity": 92,
                    }
                ],
            )

        self.assertIn("extended note clear step left 1 notes", str(context.exception))
        self.assertEqual(len(clip.stored_notes), 1)

    def test_replace_notes_falls_back_to_replace_selected_notes_sequence(self):
        clip = ReplaceSelectedNotesClip()
        clip.stored_notes = [
            {
                "pitch": 36,
                "start_time": 0.0,
                "duration": 1.0,
                "velocity": 100,
                "mute": False,
            }
        ]
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.replace_notes(
            "clip:session:track:1:slot:1",
            [
                {
                    "pitch": 67,
                    "startBeats": 2.0,
                    "durationBeats": 0.5,
                    "velocity": 92,
                }
            ],
        )

        self.assertEqual(result["note_count"], 1)
        self.assertEqual(clip.calls[0], ("select_all_notes",))
        self.assertEqual(clip.calls[1], ("replace_selected_notes",))
        self.assertEqual(clip.calls[2], ("notes", 1))
        self.assertEqual(clip.calls[3], ("note", 67, 2.0, 0.5, 92, False))
        self.assertEqual(clip.calls[4], ("done",))
        self.assertEqual(clip.calls[5], ("deselect_all_notes",))
        self.assertEqual(len(clip.stored_notes), 1)
        self.assertEqual(clip.stored_notes[0]["pitch"], 67)

    def test_clip_serialization_prefers_extended_note_reads(self):
        clip = ExtendedNotesClip()
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        track = adapter.get_tracks()[0]
        clip_state = track["session_clips"][0]

        self.assertEqual(clip_state["note_count"], 2)
        self.assertEqual(clip_state["noteCount"], 2)
        self.assertEqual(clip_state["notes"][0]["pitch"], 60)
        self.assertEqual(clip_state["notes"][1]["duration"], 0.5)

    def test_browser_queries_and_loads_device(self):
        song = SongWithSingleClip(DirectSetNotesClip())
        application = BrowserApplication(song)
        adapter = LiveSetAdapter(song, application=application)

        tree = adapter.get_browser_tree()
        items = adapter.get_browser_items("instruments")
        result = adapter.load_browser_item("track:1", path="instruments/Operator")

        self.assertEqual(tree["roots"][0]["name"], "Instruments")
        self.assertEqual(items["items"][0]["name"], "Operator")
        self.assertEqual(result["item"]["name"], "Operator")
        self.assertEqual(result["track"]["devices"][-1]["name"], "Operator")

    def test_launch_clip_marks_clip_playing(self):
        clip = DirectSetNotesClip()
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.launch_clip("clip:session:track:1:slot:1")

        self.assertTrue(result["clip"]["is_playing"])
        self.assertTrue(song.is_playing)

    def test_launch_scene_fires_matching_slot_index(self):
        clip_a = DirectSetNotesClip()
        clip_b = DirectSetNotesClip()
        song = SongWithSceneClips([clip_a], [clip_b])
        adapter = LiveSetAdapter(song)

        result = adapter.launch_scene("scene:1")

        self.assertEqual(result["scene"]["id"], "scene:1")
        self.assertTrue(song.tracks[0].clip_slots[0].clip.is_playing)
        self.assertTrue(song.tracks[1].clip_slots[0].clip.is_playing)

    def test_stop_track_clips_clears_track_play_state(self):
        clip = DirectSetNotesClip()
        song = SongWithSingleClip(clip)
        song.tracks[0].clip_slots[0].fire()
        adapter = LiveSetAdapter(song)

        result = adapter.stop_track_clips("track:1")

        self.assertEqual(result["track"]["id"], "track:1")
        self.assertFalse(song.tracks[0].clip_slots[0].clip.is_playing)


class SongWithSingleClip(object):
    def __init__(self, clip):
        self.live_version = "12.1.10"
        self.tracks = [TrackWithSingleClip(clip)]
        self.scenes = [SceneStub("Scene 1", self, 0)]
        self.tracks[0].song = self
        self.view = SongView(self)
        self.is_playing = False

    def start_playing(self):
        self.is_playing = True

    def stop_all_clips(self):
        for track in self.tracks:
            track.stop_all_clips()


class SongWithSceneClips(object):
    def __init__(self, track_a_clips, track_b_clips):
        self.live_version = "12.1.10"
        self.tracks = [
            TrackWithClips("Track 1", track_a_clips, self),
            TrackWithClips("Track 2", track_b_clips, self),
        ]
        self.scenes = [SceneStub("Scene 1", self, 0)]
        self.view = SongView(self)
        self.is_playing = False

    def start_playing(self):
        self.is_playing = True

    def stop_all_clips(self):
        for track in self.tracks:
            track.stop_all_clips()


class TrackWithSingleClip(object):
    def __init__(self, clip):
        self.name = "Track 1"
        self.type = "midi"
        self.arm = False
        self.mute = False
        self.solo = False
        self.playing_slot_index = -1
        self.fired_slot_index = -1
        self.song = None
        self.clip_slots = [ClipSlotWithClip(clip, self, 0)]
        self.devices = []

    def stop_all_clips(self):
        self.playing_slot_index = -1
        self.fired_slot_index = -1
        for slot in self.clip_slots:
            if slot.clip is not None:
                slot.clip.is_playing = False


class TrackWithClips(object):
    def __init__(self, name, clips, song):
        self.name = name
        self.type = "midi"
        self.arm = False
        self.mute = False
        self.solo = False
        self.song = song
        self.playing_slot_index = -1
        self.fired_slot_index = -1
        self.clip_slots = [ClipSlotWithClip(clip, self, index) for index, clip in enumerate(clips)]
        self.devices = []

    def stop_all_clips(self):
        self.playing_slot_index = -1
        self.fired_slot_index = -1
        for slot in self.clip_slots:
            if slot.clip is not None:
                slot.clip.is_playing = False


class SongView(object):
    def __init__(self, song):
        self.selected_track = song.tracks[0]
        self.selected_scene = song.scenes[0] if song.scenes else None
        self.highlighted_clip_slot = None


class ClipSlotWithClip(object):
    def __init__(self, clip, track, index):
        self.clip = clip
        self.track = track
        self.index = index

    @property
    def has_clip(self):
        return True

    def fire(self):
        for slot in self.track.clip_slots:
            if slot.clip is not None:
                slot.clip.is_playing = slot is self
        self.track.playing_slot_index = self.index
        self.track.fired_slot_index = self.index
        self.track.song.view.highlighted_clip_slot = self
        self.track.song.start_playing()


class SceneStub(object):
    def __init__(self, name, song, index):
        self.name = name
        self.song = song
        self.index = index

    def fire(self):
        for track in self.song.tracks:
            if self.index < len(track.clip_slots):
                track.clip_slots[self.index].fire()
        self.song.view.selected_scene = self
        self.song.start_playing()


class SetNotesSequenceClip(object):
    def __init__(self):
        self.name = "Clip 1"
        self.length = 4
        self.is_playing = False
        self.stored_notes = []
        self.calls = []

    def set_notes(self):
        self.calls.append(("set_notes",))

    def notes(self, count):
        self.calls.append(("notes", count))

    def note(self, pitch, start_time, duration, velocity, mute):
        self.calls.append(("note", pitch, start_time, duration, velocity, mute))
        self.stored_notes.append(
            {
                "pitch": pitch,
                "start_time": start_time,
                "duration": duration,
                "velocity": velocity,
                "mute": mute,
            }
        )

    def done(self):
        self.calls.append(("done",))


class ReplaceSelectedNotesClip(object):
    def __init__(self):
        self.name = "Replace Selected"
        self.length = 4
        self.is_playing = False
        self.stored_notes = []
        self.calls = []

    def select_all_notes(self):
        self.calls.append(("select_all_notes",))

    def replace_selected_notes(self):
        self.calls.append(("replace_selected_notes",))
        self.stored_notes = []

    def notes(self, count):
        self.calls.append(("notes", count))

    def note(self, pitch, start_time, duration, velocity, mute):
        self.calls.append(("note", pitch, start_time, duration, velocity, mute))
        self.stored_notes.append(
            {
                "pitch": pitch,
                "start_time": start_time,
                "duration": duration,
                "velocity": velocity,
                "mute": mute,
            }
        )

    def done(self):
        self.calls.append(("done",))

    def deselect_all_notes(self):
        self.calls.append(("deselect_all_notes",))


class ReplaceByIdClip(object):
    def __init__(self):
        self.name = "Replace By Id"
        self.length = 4
        self.is_playing = False
        self.stored_notes = []
        self.calls = []
        self.add_new_notes_payload = None

    def get_all_notes_extended(self):
        return {"notes": list(self.stored_notes)}

    def remove_notes_by_id(self, note_ids):
        self.calls.append(("remove_notes_by_id", list(note_ids)))
        self.stored_notes = [note for note in self.stored_notes if note.get("note_id") not in set(note_ids)]

    def add_new_notes(self, payload):
        self.calls.append(("add_new_notes", payload))
        self.add_new_notes_payload = payload
        self.stored_notes.extend(list(payload.get("notes", [])))


class RemoveNotesExtendedDictClip(object):
    def __init__(self):
        self.name = "Remove Extended Dict"
        self.length = 4
        self.is_playing = False
        self.stored_notes = []
        self.calls = []
        self.add_new_notes_payload = None

    def get_all_notes_extended(self):
        return {"notes": list(self.stored_notes)}

    def remove_notes_extended(self, payload):
        self.calls.append(("remove_notes_extended", payload))
        if not isinstance(payload, dict):
            raise TypeError("dict payload required")
        self.stored_notes = []

    def add_new_notes(self, payload):
        self.calls.append(("add_new_notes", payload))
        self.add_new_notes_payload = payload
        self.stored_notes.extend(list(payload.get("notes", [])))


class NoOpRemoveNotesExtendedClip(object):
    def __init__(self):
        self.name = "Remove Extended No-op"
        self.length = 4
        self.is_playing = False
        self.stored_notes = []
        self.calls = []

    def get_all_notes_extended(self):
        return {"notes": list(self.stored_notes)}

    def remove_notes_extended(self, payload):
        self.calls.append(("remove_notes_extended", payload))

    def add_new_notes(self, payload):
        self.calls.append(("add_new_notes", payload))


class AddNewNotesClip(object):
    def __init__(self):
        self.name = "Add New Notes"
        self.length = 4
        self.is_playing = False
        self.add_new_notes_payload = None

    def add_new_notes(self, payload):
        self.add_new_notes_payload = payload

    def get_all_notes_extended(self):
        return self.add_new_notes_payload or {"notes": []}


class DirectSetNotesClip(object):
    def __init__(self):
        self.name = "Direct Set"
        self.length = 4
        self.is_playing = False
        self.set_notes_payload = None

    def set_notes(self, notes):
        self.set_notes_payload = notes

    def get_all_notes(self):
        return self.set_notes_payload or []


class ExtendedNotesClip(object):
    def __init__(self):
        self.name = "Extended Notes"
        self.length = 4
        self.is_playing = False

    def get_all_notes_extended(self):
        return {
            "notes": [
                {
                    "pitch": 60,
                    "start_time": 0.0,
                    "duration": 0.25,
                    "velocity": 100,
                    "mute": False,
                },
                {
                    "pitch": 67,
                    "start_time": 0.5,
                    "duration": 0.5,
                    "velocity": 110,
                    "mute": False,
                },
            ]
        }


class BrowserApplication(object):
    def __init__(self, song):
        self.browser = BrowserRoot(song)


class BrowserRoot(object):
    def __init__(self, song):
        self.song = song
        self.instruments = BrowserItem(
            "Instruments",
            "browser:instruments",
            children=[BrowserItem("Operator", "browser:instruments:operator", is_device=True, is_loadable=True)],
        )
        self.sounds = BrowserItem("Sounds", "browser:sounds", children=[])
        self.drums = BrowserItem("Drums", "browser:drums", children=[])
        self.audio_effects = BrowserItem("Audio Effects", "browser:audio_effects", children=[])
        self.midi_effects = BrowserItem("MIDI Effects", "browser:midi_effects", children=[])

    def load_item(self, item):
        track = self.song.view.selected_track
        track.devices.append(SimpleDevice(item.name))


class BrowserItem(object):
    def __init__(self, name, uri, children=None, is_device=False, is_loadable=False):
        self.name = name
        self.uri = uri
        self.children = list(children or [])
        self.is_device = is_device
        self.is_loadable = is_loadable


class SimpleDevice(object):
    def __init__(self, name):
        self.name = name
        self.class_name = name
        self.parameters = []
