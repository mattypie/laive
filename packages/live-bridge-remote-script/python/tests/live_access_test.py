from __future__ import absolute_import, print_function, unicode_literals

import unittest

from laive.live_access import LiveSetAdapter


class SetNotesFallbackTests(unittest.TestCase):
    def test_insert_notes_uses_note_spec_dicts_for_set_notes_fallback(self):
        clip = SetNotesOnlyClip()
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
        self.assertEqual(
            clip.received_notes,
            (
                {
                    "pitch": 60,
                    "start_time": 0.0,
                    "duration": 0.5,
                    "velocity": 100,
                    "mute": False,
                    "probability": 1.0,
                    "velocity_deviation": 0.0,
                    "release_velocity": 64,
                },
            ),
        )


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


class SetNotesOnlyClip(object):
    def __init__(self):
        self.name = "Clip 1"
        self.length = 4
        self.is_playing = False
        self.notes = []
        self.received_notes = None

    def set_notes(self, notes):
        self.received_notes = notes
        self.notes = list(notes)
