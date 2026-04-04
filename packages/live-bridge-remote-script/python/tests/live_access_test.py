from __future__ import absolute_import, print_function, unicode_literals

import unittest

from laive.clip_notes import ClipNoteAdapter
from laive.fake_live import FakeClip, FakeSong
from laive.live_access import LiveSetAdapter
from laive.protocol import RequestError
from laive.serializers import serialize_track_state


class LegacyNoteSequenceTests(unittest.TestCase):
    def test_insert_notes_prefers_add_new_notes_with_python_note_specs(self):
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
        self.assertEqual(clip.add_new_notes_payload, ((64, 1.0, 0.25, 96, False),))
        self.assertEqual(result["clip"]["note_count"], 1)
        self.assertEqual(result["clip"]["notes"][0]["pitch"], 64)

    def test_add_new_notes_uses_midi_note_specification_when_live_module_is_available(self):
        clip = AddNewNotesClip()
        adapter = ClipNoteAdapter(live_module=FakeLiveModule())

        adapter.write_notes(
            clip,
            [
                {
                    "pitch": 67,
                    "startBeats": 2.0,
                    "durationBeats": 0.5,
                    "velocity": 92,
                }
            ],
        )

        self.assertEqual(len(clip.add_new_notes_payload), 1)
        spec = clip.add_new_notes_payload[0]
        self.assertIsInstance(spec, FakeMidiNoteSpecification)
        self.assertEqual(spec.pitch, 67)
        self.assertEqual(spec.start_time, 2.0)
        self.assertEqual(spec.duration, 0.5)
        self.assertEqual(spec.velocity, 92)
        self.assertEqual(spec.mute, False)

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
        self.assertEqual(clip.add_new_notes_payload, ((67, 2.0, 0.5, 92, False),))
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
        self.assertEqual(clip.add_new_notes_payload, ((67, 2.0, 0.5, 92, False),))
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

    def test_browser_load_can_target_return_and_master_tracks(self):
        song = FakeSong()
        application = BrowserApplication(song)
        adapter = LiveSetAdapter(song, application=application)

        return_result = adapter.load_browser_item("track:return:1", path="audio_effects/EQ Eight")
        master_result = adapter.load_browser_item("track:master", path="audio_effects/EQ Eight")

        self.assertEqual(return_result["track"]["id"], "track:return:1")
        self.assertEqual(return_result["track"]["devices"][-1]["name"], "EQ Eight")
        self.assertEqual(master_result["track"]["id"], "track:master")
        self.assertEqual(master_result["track"]["devices"][-1]["name"], "EQ Eight")

    def test_browser_tree_exposes_optional_user_library_root_when_available(self):
        song = SongWithSingleClip(DirectSetNotesClip())
        application = BrowserApplication(song)
        adapter = LiveSetAdapter(song, application=application)

        tree = adapter.get_browser_tree()

        root_paths = [root["path"] for root in tree["roots"]]
        self.assertIn("user_library", root_paths)

    def test_select_track_updates_song_view(self):
        song = SongWithSceneClips([DirectSetNotesClip()], [DirectSetNotesClip()])
        adapter = LiveSetAdapter(song)

        result = adapter.select_track("track:2")

        self.assertEqual(result["track"]["id"], "track:2")
        self.assertEqual(song.view.selected_track, song.tracks[1])

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

    def test_session_clip_editing_primitives(self):
        clip = DirectSetNotesClip()
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)
        song.tracks[0].clip_slots.append(ClipSlotWithClip(None, song.tracks[0], 1))
        song.tracks[0].clip_slots.append(ClipSlotWithClip(None, song.tracks[0], 2))

        renamed = adapter.rename_clip("clip:session:track:1:slot:1", "Renamed Clip")
        duplicated = adapter.duplicate_clip("clip:session:track:1:slot:1", 1)
        moved = adapter.move_session_clip("clip:session:track:1:slot:2", 2)
        looped = adapter.set_clip_loop_or_length(
            "clip:session:track:1:slot:1",
            length_beats=8,
            loop_end_beats=8,
        )
        deleted = adapter.delete_clip("clip:session:track:1:slot:3")

        self.assertEqual(renamed["clip"]["name"], "Renamed Clip")
        self.assertEqual(duplicated["clip"]["id"], "clip:session:track:1:slot:2")
        self.assertEqual(moved["clip"]["id"], "clip:session:track:1:slot:3")
        self.assertEqual(looped["clip"]["length_beats"], 8.0)
        self.assertEqual(looped["clip"]["loop_end_beats"], 8.0)
        self.assertEqual(deleted["clip_id"], "clip:session:track:1:slot:3")
        self.assertFalse(song.tracks[0].clip_slots[2].has_clip)

    def test_parameter_serialization_exposes_quantized_value_items(self):
        clip = DirectSetNotesClip()
        song = SongWithSingleClip(clip)
        song.tracks[0].devices.append(
            SimpleDevice(
                "Auto Filter",
                parameters=[
                    QuantizedParameter(
                        "LFO Waveform",
                        1,
                        minimum=0,
                        maximum=2,
                        value_items=["Sine", "Square", "Random"],
                    )
                ],
            )
        )
        adapter = LiveSetAdapter(song)

        device = adapter.get_tracks()[0]["devices"][-1]
        parameter = device["parameters"][0]

        self.assertTrue(parameter["is_quantized"])
        self.assertEqual(parameter["value_items"][0], "Sine")
        self.assertEqual(parameter["value_items"][2], "Random")

    def test_parameter_serialization_ignores_value_items_on_non_quantized_parameters(self):
        clip = DirectSetNotesClip()
        song = SongWithSingleClip(clip)
        song.tracks[0].devices.append(
            SimpleDevice(
                "Operator",
                parameters=[NonQuantizedValueItemsParameter("Algorithm", 0)],
            )
        )
        adapter = LiveSetAdapter(song)

        device = adapter.get_tracks()[0]["devices"][-1]
        parameter = device["parameters"][0]

        self.assertFalse(parameter["is_quantized"])
        self.assertEqual(parameter["value_items"], [])

    def test_set_clip_loop_or_length_uses_loop_markers_when_length_is_read_only(self):
        clip = ReadOnlyLengthClip()
        song = SongWithSingleClip(clip)
        adapter = LiveSetAdapter(song)

        result = adapter.set_clip_loop_or_length(
            "clip:session:track:1:slot:1",
            length_beats=8,
            looping=True,
        )

        self.assertEqual(result["clip"]["loop_end_beats"], 8.0)
        self.assertEqual(result["clip"]["length_beats"], 8.0)
        self.assertEqual(clip.loop_end, 8.0)

    def test_return_and_master_tracks_are_serialized(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        tracks = adapter.get_tracks()
        return_tracks = adapter.get_return_tracks()
        master_track = adapter.get_master_track()

        self.assertTrue(any(track["section"] == "return" for track in tracks))
        self.assertEqual(return_tracks[0]["id"], "track:return:1")
        self.assertEqual(master_track["section"], "master")

    def test_song_state_includes_arrangement_transport_and_loop_fields(self):
        song = FakeSong()
        song.current_song_time = 12.5
        song.loop = True
        song.loop_start = 4.0
        song.loop_length = 32.0
        adapter = LiveSetAdapter(song)

        state = adapter.get_song_state()

        self.assertEqual(state["arrangement_position_beats"], 12.5)
        self.assertTrue(state["loop_enabled"])
        self.assertEqual(state["loop_start_beats"], 4.0)
        self.assertEqual(state["loop_length_beats"], 32.0)
        self.assertEqual(state["loop"]["length_beats"], 32.0)

    def test_tracks_include_arrangement_clips(self):
        adapter = LiveSetAdapter(FakeSong())

        tracks = adapter.get_tracks()
        bass_track = [track for track in tracks if track["id"] == "track:2"][0]
        arrangement_clip = bass_track["arrangement_clips"][0]

        self.assertEqual(arrangement_clip["location"], "arrangement")
        self.assertEqual(arrangement_clip["id"], "clip:arrangement:track:2:index:1")
        self.assertEqual(arrangement_clip["arrangement_index"], 0)
        self.assertEqual(arrangement_clip["start_beats"], 8.0)
        self.assertEqual(arrangement_clip["end_beats"], 16.0)

    def test_get_clip_supports_arrangement_clip_ids(self):
        adapter = LiveSetAdapter(FakeSong())

        clip = adapter.get_clip("clip:arrangement:track:2:index:1")

        self.assertEqual(clip["location"], "arrangement")
        self.assertEqual(clip["track_id"], "track:2")
        self.assertEqual(clip["arrangement_index"], 0)
        self.assertEqual(clip["start_beats"], 8.0)
        self.assertEqual(clip["end_beats"], 16.0)

    def test_set_arrangement_state_updates_song(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_arrangement_state(
            arrangement_position_beats=24.0,
            loop_enabled=True,
            loop_start_beats=8.0,
            loop_length_beats=16.0,
        )

        self.assertEqual(result["target"], "song.arrangement")
        self.assertEqual(result["song"]["arrangement_position_beats"], 24.0)
        self.assertTrue(result["song"]["loop_enabled"])
        self.assertEqual(song.current_song_time, 24.0)
        self.assertTrue(song.loop)
        self.assertEqual(song.loop_start, 8.0)
        self.assertEqual(song.loop_length, 16.0)

    def test_create_arrangement_clip_creates_clip_on_visible_track(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.create_arrangement_clip(
            "track:1",
            start_beats=4,
            length_beats=8,
            name="Arrangement Verse",
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["id"], "clip:arrangement:track:1:index:1")
        self.assertEqual(result["clip"]["start_beats"], 4.0)
        self.assertEqual(result["clip"]["end_beats"], 12.0)
        self.assertEqual(result["clip"]["name"], "Arrangement Verse")
        self.assertEqual(song.tracks[0].arrangement_clips[0].name, "Arrangement Verse")

    def test_create_arrangement_clip_falls_back_to_session_duplication(self):
        song = FakeSong()
        song.tracks[0].create_midi_clip = None
        adapter = LiveSetAdapter(song)

        result = adapter.create_arrangement_clip(
            "track:1",
            start_beats=12,
            length_beats=4,
            name="Fallback Arrange",
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["id"], "clip:arrangement:track:1:index:1")
        self.assertEqual(result["clip"]["start_beats"], 12.0)
        self.assertEqual(result["clip"]["end_beats"], 16.0)
        self.assertEqual(result["clip"]["name"], "Fallback Arrange")
        self.assertEqual(song.tracks[0].arrangement_clips[0].name, "Fallback Arrange")
        self.assertFalse(song.tracks[0].clip_slots[0].has_clip)

    def test_create_arrangement_clip_fallback_cleans_up_temporary_scene(self):
        song = FakeSong()
        song.tracks[0].create_midi_clip = None
        for slot in song.tracks[0].clip_slots:
            slot.create_clip(4)
        initial_scene_count = len(song.scenes)
        adapter = LiveSetAdapter(song)

        result = adapter.create_arrangement_clip(
            "track:1",
            start_beats=20,
            length_beats=8,
            name="Scene Fallback",
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["id"], "clip:arrangement:track:1:index:1")
        self.assertEqual(result["clip"]["name"], "Scene Fallback")
        self.assertEqual(len(song.scenes), initial_scene_count)
        self.assertEqual(len(song.tracks[0].clip_slots), initial_scene_count + 2)
        self.assertTrue(all(slot.has_clip for slot in song.tracks[0].clip_slots))

    def test_duplicate_clip_to_arrangement_copies_session_clip(self):
        song = FakeSong()
        song.tracks[0].clip_slots[0].create_clip(4)
        song.tracks[0].clip_slots[0].clip.name = "Session Source"
        song.tracks[0].clip_slots[0].clip.notes = [
            {"pitch": 60, "start_time": 0.0, "duration": 1.0, "velocity": 100, "mute": False}
        ]
        adapter = LiveSetAdapter(song)

        result = adapter.duplicate_clip_to_arrangement(
            "clip:session:track:1:slot:1",
            destination_beats=12,
            target_track_id="track:1",
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["id"], "clip:arrangement:track:1:index:1")
        self.assertEqual(result["clip"]["start_beats"], 12.0)
        self.assertEqual(result["clip"]["end_beats"], 16.0)
        self.assertEqual(result["clip"]["name"], "Session Source")
        self.assertEqual(song.tracks[0].arrangement_clips[0].name, "Session Source")
        self.assertEqual(song.tracks[0].arrangement_clips[0].notes[0]["pitch"], 60)

    def test_move_arrangement_clip_updates_position_when_runtime_allows(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.move_arrangement_clip(
            "clip:arrangement:track:2:index:1",
            destination_beats=24,
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["id"], "clip:arrangement:track:2:index:1")
        self.assertEqual(result["clip"]["start_beats"], 24.0)
        self.assertEqual(result["clip"]["end_beats"], 32.0)
        self.assertEqual(song.tracks[1].arrangement_clips[0].start_time, 24.0)

    def test_move_arrangement_clip_falls_back_to_duplicate_and_delete(self):
        class ImmutableArrangementClip(object):
            def __init__(self, name, length):
                self.name = name
                self.length = length
                self.looping = True
                self.loop_start = 0.0
                self.loop_end = float(length)
                self.notes = []
                self._start_time = 8.0
                self._end_time = 16.0

            @property
            def start_time(self):
                return self._start_time

            @start_time.setter
            def start_time(self, _value):
                raise RuntimeError("start_time is read-only")

            @property
            def end_time(self):
                return self._end_time

            @end_time.setter
            def end_time(self, _value):
                raise RuntimeError("end_time is read-only")

        song = FakeSong()
        clip = ImmutableArrangementClip(name="Locked Arrange", length=8)
        song.tracks[0].arrangement_clips = [clip]
        adapter = LiveSetAdapter(song)

        result = adapter.move_arrangement_clip(
            "clip:arrangement:track:1:index:1",
            destination_beats=20,
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["start_beats"], 20.0)
        self.assertEqual(result["clip"]["end_beats"], 28.0)
        self.assertEqual(len(song.tracks[0].arrangement_clips), 1)
        self.assertEqual(song.tracks[0].arrangement_clips[0].start_time, 20.0)

    def test_move_arrangement_clip_falls_back_when_position_write_is_ignored(self):
        class NoOpMoveClip(FakeClip):
            @property
            def start_time(self):
                return getattr(self, "_start_time", 8.0)

            @start_time.setter
            def start_time(self, _value):
                return None

            @property
            def end_time(self):
                return getattr(self, "_end_time", 16.0)

            @end_time.setter
            def end_time(self, _value):
                return None

        song = FakeSong()
        clip = NoOpMoveClip(name="Sticky Arrange", length=8)
        clip._start_time = 8.0
        clip._end_time = 16.0
        song.tracks[0].arrangement_clips = [clip]
        adapter = LiveSetAdapter(song)

        result = adapter.move_arrangement_clip(
            "clip:arrangement:track:1:index:1",
            destination_beats=24,
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["start_beats"], 24.0)
        self.assertEqual(result["clip"]["end_beats"], 32.0)
        self.assertEqual(len(song.tracks[0].arrangement_clips), 1)
        self.assertEqual(song.tracks[0].arrangement_clips[0].start_time, 24.0)

    def test_move_arrangement_clip_falls_back_when_clip_cannot_be_relocated(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        original_find_arrangement_clip_index = adapter._find_arrangement_clip_index

        call_count = {"count": 0}

        def broken_find_arrangement_clip_index(track, target_clip, fallback_index=None):
            call_count["count"] += 1
            if call_count["count"] == 1:
                raise RequestError("runtime_error", "Arrangement clip could not be located after mutation")
            return original_find_arrangement_clip_index(track, target_clip, fallback_index=fallback_index)

        adapter._find_arrangement_clip_index = broken_find_arrangement_clip_index
        try:
            result = adapter.move_arrangement_clip(
                "clip:arrangement:track:2:index:1",
                destination_beats=28,
            )
        finally:
            adapter._find_arrangement_clip_index = original_find_arrangement_clip_index

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["start_beats"], 28.0)
        self.assertEqual(result["clip"]["end_beats"], 36.0)

    def test_set_arrangement_clip_bounds_updates_start_and_end_when_runtime_allows(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_arrangement_clip_bounds(
            "clip:arrangement:track:2:index:1",
            start_beats=10,
            end_beats=18,
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["id"], "clip:arrangement:track:2:index:1")
        self.assertEqual(result["clip"]["start_beats"], 10.0)
        self.assertEqual(result["clip"]["end_beats"], 18.0)
        self.assertEqual(song.tracks[1].arrangement_clips[0].start_time, 10.0)
        self.assertEqual(song.tracks[1].arrangement_clips[0].end_time, 18.0)

    def test_set_arrangement_clip_bounds_supports_dry_run(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_arrangement_clip_bounds(
            "clip:arrangement:track:2:index:1",
            start_beats=12,
            end_beats=20,
            dry_run=True,
        )

        self.assertFalse(result["applied"])
        self.assertEqual(result["clip"]["start_beats"], 12.0)
        self.assertEqual(result["clip"]["end_beats"], 20.0)
        self.assertEqual(song.tracks[1].arrangement_clips[0].start_time, 8.0)
        self.assertEqual(song.tracks[1].arrangement_clips[0].end_time, 16.0)

    def test_set_arrangement_clip_bounds_falls_back_when_runtime_cannot_apply_bounds(self):
        class ImmutableBoundsClip(object):
            def __init__(self, name, length):
                self.name = name
                self.length = length
                self.looping = True
                self.loop_start = 0.0
                self.loop_end = float(length)
                self.notes = []
                self._start_time = 8.0
                self._end_time = 16.0

            @property
            def start_time(self):
                return self._start_time

            @start_time.setter
            def start_time(self, _value):
                raise RuntimeError("start_time is read-only")

            @property
            def end_time(self):
                return self._end_time

            @end_time.setter
            def end_time(self, _value):
                raise RuntimeError("end_time is read-only")

        song = FakeSong()
        song.tracks[0].arrangement_clips = [ImmutableBoundsClip(name="Locked", length=8)]
        adapter = LiveSetAdapter(song)

        result = adapter.set_arrangement_clip_bounds(
            "clip:arrangement:track:1:index:1",
            start_beats=12,
            end_beats=20,
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["clip"]["start_beats"], 12.0)
        self.assertEqual(result["clip"]["end_beats"], 20.0)
        self.assertEqual(len(song.tracks[0].arrangement_clips), 1)
        self.assertEqual(song.tracks[0].arrangement_clips[0].start_time, 12.0)
        self.assertEqual(song.tracks[0].arrangement_clips[0].end_time, 20.0)

    def test_serialize_track_state_tolerates_missing_mixer_only_properties(self):
        class MixerOnlyTrack(object):
            name = "Master"
            type = "audio"
            section = "master"
            mixer_device = None
            clip_slots = []
            devices = []

            @property
            def arm(self):
                raise RuntimeError("Master and Return Tracks have no 'Arm' state!")

            @property
            def mute(self):
                raise RuntimeError("Master and Return Tracks have no 'Mute' state!")

            @property
            def solo(self):
                raise RuntimeError("Master and Return Tracks have no 'Solo' state!")

        track_state = serialize_track_state(
            MixerOnlyTrack(),
            0,
            "track:master",
            [],
            [],
            [],
            section="master",
        )

        self.assertEqual(track_state["id"], "track:master")
        self.assertEqual(track_state["section"], "master")
        self.assertEqual(track_state["arm"], False)
        self.assertEqual(track_state["mute"], False)
        self.assertEqual(track_state["solo"], False)

    def test_tracks_tolerate_runtime_error_when_arrangement_clips_are_unavailable(self):
        class MixerOnlyTrack(object):
            name = "Master"
            type = "audio"
            section = "master"
            mixer_device = None
            clip_slots = []
            devices = []

            @property
            def arrangement_clips(self):
                raise RuntimeError("Master, Group and Return Tracks have no arrangement clips")

        song = FakeSong()
        song.master_track = MixerOnlyTrack()
        adapter = LiveSetAdapter(song)

        master_track = adapter.get_master_track()
        all_tracks = adapter.get_tracks()

        self.assertEqual(master_track["arrangement_clips"], [])
        self.assertTrue(any(track["id"] == "track:master" for track in all_tracks))

    def test_set_send_level_updates_track_send(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_send_level("track:1", 0, 0.45)

        self.assertEqual(result["send"]["value"], 0.45)
        self.assertEqual(result["track"]["sends"][0]["value"], 0.45)

    def test_set_monitor_state_updates_visible_track(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_monitor_state("track:1", 2)

        self.assertEqual(result["track"]["monitoring_state"], 2)
        self.assertEqual(song.tracks[0].current_monitoring_state, 2)

    def test_set_track_volume_updates_mixer_parameter(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_track_volume("track:return:1", 0.65)

        self.assertEqual(result["parameter"]["value"], 0.65)
        self.assertEqual(song.return_tracks[0].mixer_device.volume.value, 0.65)

    def test_set_track_panning_updates_mixer_parameter(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_track_panning("track:master", -0.25)

        self.assertEqual(result["parameter"]["value"], -0.25)
        self.assertEqual(song.master_track.mixer_device.panning.value, -0.25)

    def test_set_track_routing_matches_display_name(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.set_track_routing(
            "track:1",
            output_routing_type="Sends Only",
        )

        self.assertEqual(
            result["track"]["output_routing_type"]["identifier"],
            "sends_only",
        )


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
        return self.clip is not None

    def create_clip(self, length):
        self.clip = DirectSetNotesClip()
        self.clip.length = length
        self.clip.loop_end = length

    def delete_clip(self):
        self.clip = None

    def duplicate_clip_to(self, target_slot):
        target_slot.clip = DirectSetNotesClip()
        target_slot.clip.name = self.clip.name
        target_slot.clip.length = self.clip.length
        target_slot.clip.loop_start = self.clip.loop_start
        target_slot.clip.loop_end = self.clip.loop_end
        target_slot.clip.looping = self.clip.looping
        target_slot.clip.stored_notes = list(getattr(self.clip, "stored_notes", []))

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
        self.stored_notes.extend([coerce_note_spec(spec) for spec in payload])


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
        self.stored_notes.extend([coerce_note_spec(spec) for spec in payload])


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
        self.looping = True
        self.loop_start = 0.0
        self.loop_end = 4
        self.is_playing = False
        self.add_new_notes_payload = None

    def add_new_notes(self, payload):
        self.add_new_notes_payload = payload
        self.stored_notes = [coerce_note_spec(spec) for spec in payload]

    def get_all_notes_extended(self):
        return {"notes": list(getattr(self, "stored_notes", []))}


class DirectSetNotesClip(object):
    def __init__(self):
        self.name = "Direct Set"
        self.length = 4
        self.looping = True
        self.loop_start = 0.0
        self.loop_end = 4
        self.is_playing = False
        self.set_notes_payload = None
        self.stored_notes = []

    def set_notes(self, notes):
        self.set_notes_payload = notes
        self.stored_notes = [coerce_note_spec(note) for note in notes]

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
        self.audio_effects = BrowserItem(
            "Audio Effects",
            "browser:audio_effects",
            children=[BrowserItem("EQ Eight", "browser:audio_effects:eq-eight", is_device=True, is_loadable=True)],
        )
        self.midi_effects = BrowserItem("MIDI Effects", "browser:midi_effects", children=[])
        self.user_library = BrowserItem(
            "User Library",
            "browser:user_library",
            children=[BrowserItem("laive-sidecar", "browser:user_library:laive-sidecar", is_device=True, is_loadable=True)],
        )

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
    def __init__(self, name, parameters=None):
        self.name = name
        self.class_name = name
        self.parameters = list(parameters or [])


class QuantizedParameter(object):
    def __init__(self, name, value, minimum=0, maximum=1, value_items=None):
        self.name = name
        self.value = value
        self.min = minimum
        self.max = maximum
        self.is_quantized = True
        self.value_items = list(value_items or [])
        self.display_value = self.value_items[int(value)] if self.value_items else str(value)


class NonQuantizedValueItemsParameter(object):
    def __init__(self, name, value, minimum=0, maximum=10):
        self.name = name
        self.value = value
        self.min = minimum
        self.max = maximum
        self.is_quantized = False
        self.display_value = str(value)

    @property
    def value_items(self):
        raise RuntimeError("Only quantized parameters have value items")


class ReadOnlyLengthClip(object):
    def __init__(self):
        self.name = "Read Only Length"
        self._length = 4
        self.looping = True
        self.loop_start = 0.0
        self.loop_end = 4.0
        self.is_playing = False
        self.stored_notes = []

    @property
    def length(self):
        return self.loop_end - self.loop_start

    def get_all_notes_extended(self):
        return {"notes": list(self.stored_notes)}


class FakeMidiNoteSpecification(object):
    def __init__(self, pitch, start_time, duration, velocity, mute):
        self.pitch = pitch
        self.start_time = start_time
        self.duration = duration
        self.velocity = velocity
        self.mute = mute


class FakeLiveModule(object):
    class Clip(object):
        MidiNoteSpecification = FakeMidiNoteSpecification


def coerce_note_spec(spec):
    if isinstance(spec, dict):
        return dict(spec)

    if isinstance(spec, (list, tuple)):
        return {
            "pitch": spec[0] if len(spec) > 0 else 60,
            "start_time": spec[1] if len(spec) > 1 else 0.0,
            "duration": spec[2] if len(spec) > 2 else 0.25,
            "velocity": spec[3] if len(spec) > 3 else 100,
            "mute": bool(spec[4]) if len(spec) > 4 else False,
        }

    return {
        "pitch": getattr(spec, "pitch", 60),
        "start_time": getattr(spec, "start_time", 0.0),
        "duration": getattr(spec, "duration", 0.25),
        "velocity": getattr(spec, "velocity", 100),
        "mute": bool(getattr(spec, "mute", False)),
    }


class MixerAndRoutingTests(unittest.TestCase):
    def test_tracks_include_return_and_master_sections(self):
        adapter = LiveSetAdapter(FakeSong())

        tracks = adapter.get_tracks()
        track_ids = [track["id"] for track in tracks]

        self.assertIn("track:1", track_ids)
        self.assertIn("track:return:1", track_ids)
        self.assertIn("track:master", track_ids)
        self.assertEqual(
            next(track for track in tracks if track["id"] == "track:return:1")["section"],
            "return",
        )
        self.assertEqual(
            next(track for track in tracks if track["id"] == "track:master")["section"],
            "master",
        )

    def test_set_send_level_monitor_state_and_routing(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        send_result = adapter.set_send_level("track:1", 0, 0.45)
        monitor_result = adapter.set_monitor_state("track:1", "off")
        routing_result = adapter.set_track_routing("track:1", output_routing_type="sends_only")

        self.assertEqual(send_result["track"]["sends"][0]["value"], 0.45)
        self.assertEqual(monitor_result["track"]["monitoring_state"], 2)
        self.assertEqual(
            routing_result["track"]["output_routing_type"]["identifier"],
            "sends_only",
        )

    def test_create_return_track_updates_song_state(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.create_return_track(name="C-Texture")

        self.assertEqual(result["track"]["id"], "track:return:3")
        self.assertEqual(result["track"]["name"], "Texture")
        self.assertEqual(len(song.return_tracks), 3)
        self.assertEqual(song.return_tracks[2].name, "Texture")
        self.assertEqual(len(song.tracks[0].mixer_device.sends), 3)

    def test_create_return_track_strips_redundant_send_letter_prefix(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.create_return_track(name="C-C-Texture")

        self.assertEqual(result["track"]["name"], "Texture")
        self.assertEqual(song.return_tracks[2].name, "Texture")

    def test_create_return_track_preview_preserves_existing_song(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)

        result = adapter.create_return_track(name="Preview Return", dry_run=True)

        self.assertEqual(result["track"]["id"], "track:return:3")
        self.assertEqual(result["track"]["name"], "Preview Return")
        self.assertEqual(len(song.return_tracks), 2)

    def test_dry_run_create_actions_fall_back_without_preview_helpers(self):
        song = FakeSong()
        song.preview_track = None
        song.preview_return_track = None
        song.preview_scene = None
        song.tracks[0].clip_slots[0].preview_clip = None
        adapter = LiveSetAdapter(song)

        track_result = adapter.create_track(name="Preview Track", dry_run=True)
        return_result = adapter.create_return_track(name="Preview Return", dry_run=True)
        scene_result = adapter.create_scene(name="Preview Scene", dry_run=True)
        clip_result = adapter.create_clip("track:1", 0, length_beats=8, name="Preview Clip", dry_run=True)

        self.assertEqual(track_result["track"]["name"], "Preview Track")
        self.assertEqual(return_result["track"]["name"], "Preview Return")
        self.assertEqual(scene_result["scene"]["name"], "Preview Scene")
        self.assertEqual(clip_result["clip"]["name"], "Preview Clip")
        self.assertEqual(clip_result["clip"]["loop_end_beats"], 8)
        self.assertEqual(len(song.tracks), 2)
        self.assertEqual(len(song.return_tracks), 2)
        self.assertEqual(len(song.scenes), 2)
