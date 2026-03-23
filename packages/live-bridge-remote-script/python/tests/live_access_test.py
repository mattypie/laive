from __future__ import absolute_import, print_function, unicode_literals

import unittest

from laive.live_access import LiveSetAdapter


class LegacyNoteSequenceTests(unittest.TestCase):
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
