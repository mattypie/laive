from __future__ import absolute_import, print_function, unicode_literals

import unittest

from laive.live_access import LiveSetAdapter


class LegacyNoteSequenceTests(unittest.TestCase):
    def test_insert_notes_uses_direct_set_notes_when_available(self):
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


class SongWithSingleClip(object):
    def __init__(self, clip):
        self.live_version = "12.1.10"
        self.tracks = [TrackWithSingleClip(clip)]
        self.scenes = []


class TrackWithSingleClip(object):
    def __init__(self, clip):
        self.name = "Track 1"
        self.type = "midi"
        self.arm = False
        self.mute = False
        self.solo = False
        self.clip_slots = [ClipSlotWithClip(clip)]
        self.devices = []


class ClipSlotWithClip(object):
    def __init__(self, clip):
        self.clip = clip

    @property
    def has_clip(self):
        return True


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
