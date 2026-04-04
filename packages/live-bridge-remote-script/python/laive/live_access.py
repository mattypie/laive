from __future__ import absolute_import, print_function, unicode_literals

try:
    import Live  # type: ignore
except ImportError:  # pragma: no cover - fake harness path
    Live = None

from .clip_notes import ClipNoteAdapter
from .protocol import RequestError
from .serializers import (
    serialize_clip_state,
    serialize_device_state,
    serialize_parameter_state,
    serialize_scene_state,
    serialize_song_state,
    serialize_track_state,
)


def _track_id(index, section="visible"):
    if section == "master":
        return "track:master"
    if section == "visible":
        return "track:{0}".format(index + 1)
    return "track:{0}:{1}".format(section, index + 1)


def _scene_id(index):
    return "scene:{0}".format(index + 1)


def _clip_id(track_id, slot_index):
    return "clip:session:{0}:slot:{1}".format(track_id, slot_index + 1)


def _arrangement_clip_id(track_id, arrangement_index):
    return "clip:arrangement:{0}:index:{1}".format(track_id, arrangement_index + 1)


def _device_id(track_id, device_index):
    return "device:{0}:{1}".format(track_id, device_index + 1)


def _parameter_id(device_id, parameter_index):
    return "parameter:{0}:{1}".format(device_id, parameter_index + 1)


class LiveSetAdapter(object):
    def __init__(self, song, application=None):
        self.song = song
        self.application = application
        self._clip_notes = ClipNoteAdapter(live_module=Live)

    @property
    def live_version(self):
        return getattr(self.song, "live_version", "unknown")

    def capabilities(self):
        return {
            "read_state": True,
            "read_arrangement": True,
            "set_transport": True,
            "set_arrangement_state": True,
            "set_arrangement_transport": True,
            "select_track": True,
            "create_track": hasattr(self.song, "create_midi_track"),
            "create_return_track": hasattr(self.song, "create_return_track"),
            "create_scene": hasattr(self.song, "create_scene"),
            "create_clip": True,
            "create_arrangement_clip": True,
            "rename_clip": True,
            "duplicate_clip": True,
            "duplicate_clip_to_arrangement": True,
            "move_arrangement_clip": True,
            "move_session_clip": True,
            "delete_clip": True,
            "set_clip_loop_or_length": True,
            "insert_notes": True,
            "replace_notes": True,
            "launch_clip": True,
            "launch_scene": True,
            "stop_track_clips": True,
            "stop_all_clips": True,
            "set_parameter": True,
            "set_track_volume": True,
            "set_track_panning": True,
            "set_send_level": True,
            "set_monitor_state": True,
            "set_track_routing": True,
            "browser_access": self._browser_is_available(),
            "load_browser_item": self._browser_is_available(),
            "subscribe": True,
        }

    def get_song_state(self):
        return serialize_song_state(self.song)

    def get_arrangement_state(self):
        return serialize_song_state(self.song)

    def get_tracks(self):
        return [self._serialize_track(track, index, section) for section, index, track in self._iter_tracks()]

    def get_return_tracks(self):
        return [
            self._serialize_track(track, index, section)
            for section, index, track in self._iter_tracks()
            if section == "return"
        ]

    def get_master_track(self):
        for section, index, track in self._iter_tracks():
            if section == "master":
                return self._serialize_track(track, index, section)
        raise RequestError("not_found", "Master track is unavailable")

    def get_scenes(self):
        return [self._serialize_scene(scene, index) for index, scene in enumerate(getattr(self.song, "scenes", []))]

    def get_track(self, track_id):
        track, index, section = self._find_track(track_id)
        return self._serialize_track(track, index, section)

    def get_clip(self, clip_id):
        if isinstance(clip_id, str) and clip_id.startswith("clip:arrangement:"):
            clip, track_id, arrangement_index = self._find_arrangement_clip(clip_id)
            return self._serialize_arrangement_clip(clip, track_id, arrangement_index)
        clip, track_id, slot_index = self._find_clip(clip_id)
        return self._serialize_clip(clip, track_id, slot_index)

    def get_device(self, device_id):
        device, track_id, device_index = self._find_device(device_id)
        return self._serialize_device(device, track_id, device_index)

    def get_parameter(self, parameter_id):
        parameter, device_id, parameter_index = self._find_parameter(parameter_id)
        return self._serialize_parameter(parameter, device_id, parameter_index)

    def get_browser_tree(self):
        browser = self._browser()
        roots = []

        for category_name, category in self._browser_root_items(browser):
            roots.append(
                {
                    "path": category_name,
                    "name": self._browser_item_name(category, category_name),
                    "uri": getattr(category, "uri", None),
                    "is_folder": self._browser_item_is_folder(category),
                    "is_device": bool(getattr(category, "is_device", False)),
                    "is_loadable": bool(getattr(category, "is_loadable", False)),
                    "children": [self._serialize_browser_item(child, category_name) for child in self._browser_children(category)],
                }
            )

        return {"roots": roots}

    def get_browser_items(self, path=None):
        browser = self._browser()
        if not path:
            return {"path": None, "items": [self._serialize_browser_item(item, category_name) for category_name, item in self._browser_root_items(browser)]}

        item = self._find_browser_item_by_path(browser, path)
        return {
            "path": path,
            "item": self._serialize_browser_item(item, path),
            "items": [self._serialize_browser_item(child, self._join_browser_path(path, self._browser_item_name(child, "item"))) for child in self._browser_children(item)],
        }

    def load_browser_item(self, track_id, uri=None, path=None, dry_run=False):
        if not uri and not path:
            raise RequestError("invalid_argument", "uri or path is required")

        track, index, section = self._find_track(track_id)
        browser = self._browser()
        item = self._find_browser_item_by_uri(browser, uri) if uri else self._find_browser_item_by_path(browser, path)
        if item is None:
            raise RequestError("not_found", "Browser item not found")
        if not getattr(item, "is_loadable", True):
            raise RequestError("invalid_argument", "Browser item is not loadable")

        if not dry_run:
            song_view = getattr(self.song, "view", None)
            if song_view is not None and hasattr(song_view, "selected_track"):
                song_view.selected_track = track
            browser.load_item(item)

        return {
            "applied": not dry_run,
            "item": self._serialize_browser_item(item, path),
            "track": self._serialize_track(track, index, section),
        }

    def select_track(self, track_id, dry_run=False):
        track, index, section = self._find_track(track_id)
        song_view = getattr(self.song, "view", None)
        if song_view is None or not hasattr(song_view, "selected_track"):
            raise RequestError("unsupported_runtime", "Song track selection is unavailable")

        if not dry_run:
            song_view.selected_track = track

        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, index, section),
        }

    def set_tempo(self, value, dry_run=False):
        tempo = float(value)
        if tempo <= 0:
            raise RequestError("invalid_argument", "tempo must be positive")
        if not dry_run:
            self.song.tempo = tempo
        return {"target": "song.tempo", "applied": not dry_run, "value": tempo}

    def set_arrangement_state(
        self,
        current_song_time=None,
        arrangement_position_beats=None,
        loop_enabled=None,
        loop_start_beats=None,
        loop_length_beats=None,
        dry_run=False,
    ):
        if (
            current_song_time is None
            and arrangement_position_beats is None
            and loop_enabled is None
            and loop_start_beats is None
            and loop_length_beats is None
        ):
            raise RequestError(
                "invalid_argument",
                "At least one arrangement transport or loop field is required",
            )

        if loop_length_beats is not None and float(loop_length_beats) <= 0:
            raise RequestError("invalid_argument", "loop_length_beats must be positive")

        if not dry_run:
            position_beats = current_song_time if current_song_time is not None else arrangement_position_beats
            if position_beats is not None:
                self._set_song_arrangement_position(float(position_beats))
            if loop_enabled is not None:
                self._set_song_attribute("loop", bool(loop_enabled))
            if loop_start_beats is not None:
                self._set_song_attribute("loop_start", float(loop_start_beats))
            if loop_length_beats is not None:
                self._set_song_attribute("loop_length", float(loop_length_beats))

        song_state = self.get_song_state()
        if dry_run:
            position_beats = current_song_time if current_song_time is not None else arrangement_position_beats
            if position_beats is not None:
                song_state["current_song_time"] = float(position_beats)
                song_state["currentSongTime"] = float(position_beats)
                song_state["arrangement_position_beats"] = float(position_beats)
                song_state["arrangementPositionBeats"] = float(position_beats)
            if loop_enabled is not None:
                song_state["loop_enabled"] = bool(loop_enabled)
                song_state["loopEnabled"] = bool(loop_enabled)
            if loop_start_beats is not None:
                song_state["loop_start_beats"] = float(loop_start_beats)
                song_state["loopStartBeats"] = float(loop_start_beats)
            if loop_length_beats is not None:
                song_state["loop_length_beats"] = float(loop_length_beats)
                song_state["loopLengthBeats"] = float(loop_length_beats)
            song_state["loop"] = {
                "enabled": song_state.get("loop_enabled", song_state.get("loopEnabled", False)),
                "start_beats": song_state.get("loop_start_beats", song_state.get("loopStartBeats")),
                "length_beats": song_state.get("loop_length_beats", song_state.get("loopLengthBeats")),
            }

        return {"target": "song.arrangement", "applied": not dry_run, "song": song_state}

    def set_parameter(self, parameter_id, value, dry_run=False):
        parameter, device_id, parameter_index = self._find_parameter(parameter_id)
        next_value = float(value)
        if not dry_run:
            parameter.value = next_value
        return {
            "target": parameter_id,
            "applied": not dry_run,
            "parameter": self._serialize_parameter(parameter, device_id, parameter_index),
        }

    def set_track_volume(self, track_id, value, dry_run=False):
        track, track_index, section = self._find_track(track_id)
        parameter = self._track_mixer_parameter(track, "volume")
        next_value = float(value)
        if not dry_run:
            parameter.value = next_value
        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, track_index, section),
            "parameter": serialize_parameter_state(parameter, "mixer:{0}:volume".format(track_id)),
        }

    def set_track_panning(self, track_id, value, dry_run=False):
        track, track_index, section = self._find_track(track_id)
        parameter = self._track_mixer_parameter(track, "panning")
        next_value = float(value)
        if not dry_run:
            parameter.value = next_value
        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, track_index, section),
            "parameter": serialize_parameter_state(parameter, "mixer:{0}:panning".format(track_id)),
        }

    def set_send_level(self, track_id, send_index, value, dry_run=False):
        track, track_index, section = self._find_track(track_id)
        mixer_device = getattr(track, "mixer_device", None)
        sends = list(getattr(mixer_device, "sends", []) or [])
        if send_index is None:
            raise RequestError("invalid_argument", "send_index is required")
        if send_index < 0 or send_index >= len(sends):
            raise RequestError("not_found", "Send not found: {0}".format(send_index))
        next_value = float(value)
        if not dry_run:
            sends[send_index].value = next_value
        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, track_index, section),
            "send": serialize_parameter_state(
                sends[send_index],
                "send:{0}:{1}".format(track_id, send_index + 1),
            ),
        }

    def set_monitor_state(self, track_id, monitoring_state, dry_run=False):
        track, track_index, section = self._find_track(track_id)
        target_value = self._normalize_monitoring_state(monitoring_state)
        if not dry_run:
            if hasattr(track, "current_monitoring_state"):
                track.current_monitoring_state = target_value
            elif hasattr(track, "monitoring_state"):
                track.monitoring_state = target_value
            else:
                raise RequestError("unsupported_runtime", "Track monitoring state is unavailable")
        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, track_index, section),
        }

    def set_track_routing(
        self,
        track_id,
        input_routing_type=None,
        input_routing_channel=None,
        output_routing_type=None,
        output_routing_channel=None,
        dry_run=False,
    ):
        track, track_index, section = self._find_track(track_id)
        if (
            input_routing_type is None
            and input_routing_channel is None
            and output_routing_type is None
            and output_routing_channel is None
        ):
            raise RequestError(
                "invalid_argument",
                "At least one routing field is required",
            )

        if not dry_run:
            self._set_routing_value(track, "input_routing_type", input_routing_type)
            self._set_routing_value(track, "input_routing_channel", input_routing_channel)
            self._set_routing_value(track, "output_routing_type", output_routing_type)
            self._set_routing_value(track, "output_routing_channel", output_routing_channel)

        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, track_index, section),
        }

    def play(self, dry_run=False):
        if not dry_run:
            self.song.start_playing()
        return {"target": "transport.play", "applied": not dry_run, "is_playing": True}

    def stop(self, dry_run=False):
        if not dry_run:
            self.song.stop_playing()
        return {"target": "transport.stop", "applied": not dry_run, "is_playing": False}

    def create_track(self, kind="midi", name=None, dry_run=False):
        if kind != "midi":
            raise RequestError("unsupported_argument", "Only midi tracks are supported in the first pass")
        index = len(getattr(self.song, "tracks", []))
        if dry_run:
            preview_track = getattr(self.song, "preview_track", None)
            if callable(preview_track):
                track = preview_track(index=index, name=name)
            else:
                track = self._preview_track(index=index, name=name, section="visible")
        else:
            self.song.create_midi_track(index)
            track = self.song.tracks[index]
            if name:
                track.name = name
        return {"applied": not dry_run, "track": self._serialize_track(track, index, "visible")}

    def create_return_track(self, name=None, dry_run=False):
        index = len(getattr(self.song, "return_tracks", []))
        if dry_run:
            preview_return_track = getattr(self.song, "preview_return_track", None)
            if callable(preview_return_track):
                track = preview_return_track(index=index, name=name)
            else:
                track = self._preview_track(index=index, name=name, section="return")
        else:
            if not hasattr(self.song, "create_return_track"):
                raise RequestError("unsupported_runtime", "Return track creation is unavailable")
            self.song.create_return_track()
            track = self.song.return_tracks[index]
            if name:
                track.name = self._normalize_return_track_name(name, index)
        return {"applied": not dry_run, "track": self._serialize_track(track, index, "return")}

    def create_scene(self, name=None, dry_run=False):
        index = len(getattr(self.song, "scenes", []))
        if dry_run:
            preview_scene = getattr(self.song, "preview_scene", None)
            if callable(preview_scene):
                scene = preview_scene(index=index, name=name)
            else:
                scene = self._preview_scene(index=index, name=name)
        else:
            self.song.create_scene(index)
            scene = self.song.scenes[index]
            if name:
                scene.name = name
        return {"applied": not dry_run, "scene": self._serialize_scene(scene, index)}

    def create_clip(self, track_id, slot_index, length_beats=4, name=None, dry_run=False):
        track, _track_index, _track_section = self._find_track(track_id)
        slot = self._find_clip_slot(track, slot_index)
        self._ensure_slot_is_empty(slot, slot_index)
        if dry_run:
            preview_clip = getattr(slot, "preview_clip", None)
            if callable(preview_clip):
                clip = preview_clip(length_beats=length_beats, name=name)
            else:
                clip = self._preview_clip(length_beats=length_beats, name=name)
        else:
            slot.create_clip(length_beats)
            clip = slot.clip
            if name:
                clip.name = name
        return {"applied": not dry_run, "clip": self._serialize_clip(clip, track_id, slot_index)}

    def create_arrangement_clip(self, track_id, start_beats, length_beats=4, name=None, dry_run=False):
        track, track_index, track_section = self._find_track(track_id)
        self._ensure_arrangement_track(track_section)
        next_start_beats = float(start_beats)
        next_length_beats = float(length_beats)
        if next_start_beats < 0:
            raise RequestError("invalid_argument", "start_beats must be non-negative")
        if next_length_beats <= 0:
            raise RequestError("invalid_argument", "length_beats must be positive")

        if dry_run:
            clip = self._preview_arrangement_clip(
                start_beats=next_start_beats,
                length_beats=next_length_beats,
                name=name,
            )
            arrangement_index = len(self._get_arrangement_clips(track))
        else:
            create_midi_clip = getattr(track, "create_midi_clip", None)
            if not callable(create_midi_clip):
                clip, arrangement_index = self._create_arrangement_clip_fallback(
                    track,
                    track_id,
                    next_start_beats,
                    next_length_beats,
                    name=name,
                )
            else:
                create_midi_clip(next_start_beats, next_length_beats)
                clip, arrangement_index = self._latest_arrangement_clip(track)
                if name:
                    clip.name = name

        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, track_index, track_section),
            "clip": self._serialize_arrangement_clip(clip, track_id, arrangement_index),
        }

    def rename_clip(self, clip_id, name, dry_run=False):
        if not name:
            raise RequestError("invalid_argument", "name is required")
        clip_ref = self._find_clip_reference(clip_id)
        clip = clip_ref["clip"]
        if not dry_run:
            clip.name = name
        return {"applied": not dry_run, "clip": self._serialize_clip_reference(clip_ref)}

    def duplicate_clip(self, clip_id, target_slot_index, target_track_id=None, dry_run=False):
        source_clip, source_track_id, source_slot_index = self._find_clip(clip_id)
        source_slot = self._find_clip_slot_by_id(clip_id)
        target_track_id = target_track_id or source_track_id
        target_track, _target_track_index, _target_track_section = self._find_track(target_track_id)
        target_slot = self._find_clip_slot(target_track, target_slot_index)
        self._ensure_target_slot_is_distinct(
            source_track_id, source_slot_index, target_track_id, target_slot_index
        )
        self._ensure_slot_is_empty(target_slot, target_slot_index)

        if dry_run:
            duplicated_clip = self._preview_duplicate_clip(source_clip, target_slot_index)
        else:
            duplicated_clip = self._duplicate_clip_to_slot(source_slot, source_clip, target_slot)

        return {
            "applied": not dry_run,
            "source_clip_id": clip_id,
            "clip": self._serialize_clip(duplicated_clip, target_track_id, target_slot_index),
        }

    def move_session_clip(self, clip_id, target_slot_index, target_track_id=None, dry_run=False):
        duplication = self.duplicate_clip(
            clip_id,
            target_slot_index,
            target_track_id=target_track_id,
            dry_run=dry_run,
        )

        if not dry_run:
            self.delete_clip(clip_id, dry_run=False)

        return {
            "applied": not dry_run,
            "source_clip_id": clip_id,
            "clip": duplication["clip"],
        }

    def duplicate_clip_to_arrangement(
        self,
        clip_id,
        destination_beats,
        target_track_id=None,
        dry_run=False,
    ):
        clip_ref = self._find_clip_reference(clip_id)
        destination_beats = float(destination_beats)
        if destination_beats < 0:
            raise RequestError("invalid_argument", "destination_beats must be non-negative")
        target_track_id = target_track_id or clip_ref["track_id"]
        target_track, track_index, track_section = self._find_track(target_track_id)
        self._ensure_arrangement_track(track_section)

        if dry_run:
            duplicated_clip = self._preview_duplicate_arrangement_clip(
                clip_ref["clip"],
                destination_beats,
            )
            arrangement_index = len(self._get_arrangement_clips(target_track))
        else:
            duplicate_clip_to_arrangement = getattr(target_track, "duplicate_clip_to_arrangement", None)
            if callable(duplicate_clip_to_arrangement):
                duplicate_clip_to_arrangement(clip_ref["clip"], destination_beats)
                duplicated_clip, arrangement_index = self._latest_arrangement_clip(target_track)
            else:
                duplicated_clip, arrangement_index = self._duplicate_clip_to_arrangement_fallback(
                    target_track,
                    clip_ref["clip"],
                    destination_beats,
                )

        return {
            "applied": not dry_run,
            "source_clip_id": clip_id,
            "track": self._serialize_track(target_track, track_index, track_section),
            "clip": self._serialize_arrangement_clip(duplicated_clip, target_track_id, arrangement_index),
        }

    def move_arrangement_clip(self, clip_id, destination_beats, dry_run=False):
        clip_ref = self._find_clip_reference(clip_id)
        if clip_ref["location"] != "arrangement":
            raise RequestError("invalid_argument", "move_arrangement_clip only supports arrangement clips")

        destination_beats = float(destination_beats)
        if destination_beats < 0:
            raise RequestError("invalid_argument", "destination_beats must be non-negative")

        track, _track_index, _track_section = self._find_track(clip_ref["track_id"])

        if dry_run:
            clip_state = self._serialize_arrangement_clip(
                clip_ref["clip"],
                clip_ref["track_id"],
                clip_ref["arrangement_index"],
            )
            length_beats = self._arrangement_clip_length_beats(clip_ref["clip"])
            clip_state["start_beats"] = destination_beats
            clip_state["startBeats"] = destination_beats
            clip_state["end_beats"] = destination_beats + length_beats
            clip_state["endBeats"] = destination_beats + length_beats
        else:
            clip, arrangement_index = self._move_arrangement_clip_runtime(
                clip_ref,
                track,
                destination_beats,
            )
            clip_state = self._serialize_arrangement_clip(clip, clip_ref["track_id"], arrangement_index)

        return {
            "applied": not dry_run,
            "source_clip_id": clip_id,
            "clip": clip_state,
        }

    def delete_clip(self, clip_id, dry_run=False):
        clip_ref = self._find_clip_reference(clip_id)
        if not dry_run:
            if clip_ref["location"] == "arrangement":
                track, _track_index, _track_section = self._find_track(clip_ref["track_id"])
                delete_clip = getattr(track, "delete_clip", None)
                if callable(delete_clip):
                    delete_clip(clip_ref["clip"])
                else:
                    track.arrangement_clips = [
                        candidate
                        for candidate in self._get_arrangement_clips(track)
                        if candidate is not clip_ref["clip"]
                    ]
            else:
                slot = self._find_clip_slot_by_id(clip_id)
                delete_clip = getattr(slot, "delete_clip", None)
                if callable(delete_clip):
                    delete_clip()
                else:
                    slot.clip = None
        return self._clip_delete_result(clip_ref, applied=not dry_run)

    def set_clip_loop_or_length(
        self,
        clip_id,
        length_beats=None,
        loop_start_beats=None,
        loop_end_beats=None,
        looping=None,
        dry_run=False,
    ):
        clip_ref = self._find_clip_reference(clip_id)
        clip = clip_ref["clip"]

        if length_beats is None and loop_start_beats is None and loop_end_beats is None and looping is None:
            raise RequestError(
                "invalid_argument",
                "At least one of length_beats, loop_start_beats, loop_end_beats, or looping is required",
            )

        if loop_start_beats is not None and loop_end_beats is not None and float(loop_end_beats) <= float(loop_start_beats):
            raise RequestError("invalid_argument", "loop_end_beats must be greater than loop_start_beats")

        if length_beats is not None and float(length_beats) <= 0:
            raise RequestError("invalid_argument", "length_beats must be positive")

        if not dry_run:
            next_loop_start = float(loop_start_beats) if loop_start_beats is not None else getattr(clip, "loop_start", 0.0)
            if loop_start_beats is not None:
                self._set_clip_attribute(clip, "loop_start", next_loop_start)
            if length_beats is not None and loop_end_beats is None:
                loop_end_beats = next_loop_start + float(length_beats)
            if loop_end_beats is not None:
                self._set_clip_attribute(clip, "loop_end", float(loop_end_beats))
            if looping is not None:
                self._set_clip_attribute(clip, "looping", bool(looping))

        clip_state = self._serialize_clip_reference(clip_ref)
        if dry_run:
            if length_beats is not None:
                clip_state["length_beats"] = float(length_beats)
            if loop_start_beats is not None:
                clip_state["loop_start_beats"] = float(loop_start_beats)
                clip_state["loopStartBeats"] = float(loop_start_beats)
            if loop_end_beats is not None:
                clip_state["loop_end_beats"] = float(loop_end_beats)
                clip_state["loopEndBeats"] = float(loop_end_beats)
            if looping is not None:
                clip_state["looping"] = bool(looping)

        return {"applied": not dry_run, "clip": clip_state}

    def insert_notes(self, clip_id, notes, dry_run=False):
        clip_ref = self._find_clip_reference(clip_id)
        clip = clip_ref["clip"]
        normalized_notes = [self._clip_notes.normalize_input(note) for note in notes]
        if not dry_run:
            self._clip_notes.write_notes(clip, normalized_notes)
        note_count = len(notes)
        clip_state = self._serialize_clip_reference(clip_ref)
        if dry_run:
            clip_state["note_count"] = note_count
            clip_state["noteCount"] = note_count
        return {"applied": not dry_run, "clip": clip_state, "note_count": note_count}

    def replace_notes(self, clip_id, notes, dry_run=False):
        clip_ref = self._find_clip_reference(clip_id)
        clip = clip_ref["clip"]
        normalized_notes = [self._clip_notes.normalize_input(note) for note in notes]
        if not dry_run:
            self._clip_notes.replace_notes(clip, normalized_notes)
        note_count = len(normalized_notes)
        clip_state = self._serialize_clip_reference(clip_ref)
        if dry_run:
            clip_state["note_count"] = note_count
            clip_state["noteCount"] = note_count
        return {"applied": not dry_run, "clip": clip_state, "note_count": note_count}

    def launch_clip(self, clip_id, dry_run=False):
        clip, track_id, slot_index = self._find_clip(clip_id)
        slot = self._find_clip_slot_by_id(clip_id)
        if not dry_run:
            fire = getattr(slot, "fire", None)
            if callable(fire):
                fire()
            else:
                self._mark_clip_playing(track_id, slot_index)
        clip_state = self._serialize_clip(clip, track_id, slot_index)
        if dry_run:
            clip_state["is_playing"] = True
        return {"applied": not dry_run, "clip": clip_state}

    def launch_scene(self, scene_id, dry_run=False):
        scene, index = self._find_scene(scene_id)
        if not dry_run:
            fire = getattr(scene, "fire", None)
            if callable(fire):
                fire()
            else:
                self._mark_scene_playing(index)
        scene_state = self._serialize_scene(scene, index)
        return {"applied": not dry_run, "scene": scene_state}

    def stop_track_clips(self, track_id, dry_run=False):
        track, index, section = self._find_track(track_id)
        if not dry_run:
            stop_all_clips = getattr(track, "stop_all_clips", None)
            if callable(stop_all_clips):
                stop_all_clips()
            else:
                self._clear_track_clip_state(track)
        return {"applied": not dry_run, "track": self._serialize_track(track, index, section)}

    def stop_all_clips(self, dry_run=False):
        if not dry_run:
            stop_all_clips = getattr(self.song, "stop_all_clips", None)
            if callable(stop_all_clips):
                stop_all_clips()
            else:
                for track in getattr(self.song, "tracks", []):
                    self._clear_track_clip_state(track)
        return {"applied": not dry_run, "song": self.get_song_state()}

    def _serialize_track(self, track, index, section="visible"):
        track_id = getattr(track, "id", None) or _track_id(index, section)
        clip_slots = getattr(track, "clip_slots", [])
        arrangement_clips = self._get_arrangement_clips(track)
        devices = getattr(track, "devices", [])
        session_clips = [
            self._serialize_clip(slot.clip, track_id, slot_index)
            for slot_index, slot in enumerate(clip_slots)
            if getattr(slot, "has_clip", False)
        ]
        serialized_arrangement_clips = [
            self._serialize_arrangement_clip(clip, track_id, arrangement_index)
            for arrangement_index, clip in enumerate(arrangement_clips)
            if clip is not None
        ]
        serialized_devices = [
            self._serialize_device(device, track_id, device_index)
            for device_index, device in enumerate(devices)
        ]
        return serialize_track_state(
            track,
            index,
            track_id,
            session_clips,
            serialized_arrangement_clips,
            serialized_devices,
            section=section,
        )

    def _iter_tracks(self):
        for index, track in enumerate(getattr(self.song, "tracks", [])):
            yield ("visible", index, track)
        for index, track in enumerate(getattr(self.song, "return_tracks", [])):
            yield ("return", index, track)
        master_track = getattr(self.song, "master_track", None)
        if master_track is not None:
            yield ("master", 0, master_track)

    def _serialize_scene(self, scene, index):
        return serialize_scene_state(scene, index, getattr(scene, "id", None) or _scene_id(index))

    def _serialize_clip(self, clip, track_id, slot_index):
        return serialize_clip_state(
            clip,
            getattr(clip, "id", None) or _clip_id(track_id, slot_index),
            track_id,
            slot_index,
            self._clip_notes.serialize_notes(clip),
        )

    def _serialize_arrangement_clip(self, clip, track_id, arrangement_index):
        return serialize_clip_state(
            clip,
            getattr(clip, "id", None) or _arrangement_clip_id(track_id, arrangement_index),
            track_id,
            None,
            self._clip_notes.serialize_notes(clip),
            location="arrangement",
            arrangement_index=arrangement_index,
        )

    def _serialize_device(self, device, track_id, device_index):
        device_id = getattr(device, "id", None) or _device_id(track_id, device_index)
        parameters = [
            self._serialize_parameter(parameter, device_id, parameter_index)
            for parameter_index, parameter in enumerate(getattr(device, "parameters", []))
        ]
        return serialize_device_state(device, device_id, parameters)

    def _serialize_parameter(self, parameter, device_id, parameter_index):
        return serialize_parameter_state(
            parameter,
            getattr(parameter, "id", None) or _parameter_id(device_id, parameter_index),
        )

    def _set_song_arrangement_position(self, value):
        if hasattr(self.song, "current_song_time"):
            self.song.current_song_time = value
            return
        if hasattr(self.song, "arrangement_position_beats"):
            self.song.arrangement_position_beats = value
            return
        raise RequestError("unsupported_runtime", "Song arrangement position is unavailable")

    def _set_song_attribute(self, name, value):
        if not hasattr(self.song, name):
            raise RequestError("unsupported_runtime", "Song {0} is unavailable".format(name))
        setattr(self.song, name, value)

    def _track_mixer_parameter(self, track, parameter_name):
        mixer_device = getattr(track, "mixer_device", None)
        parameter = getattr(mixer_device, parameter_name, None)
        if parameter is None:
            raise RequestError(
                "unsupported_runtime",
                "Track mixer parameter is unavailable: {0}".format(parameter_name),
            )
        return parameter

    def _find_track(self, track_id):
        for section, index, track in self._iter_tracks():
            candidate = getattr(track, "id", None) or _track_id(index, section)
            legacy_visible_id = "track:visible:{0}".format(index)
            if candidate == track_id or (section == "visible" and legacy_visible_id == track_id):
                return track, index, section
            if section == "master" and track_id in ("track:master", "track:master:0"):
                return track, index, section
        raise RequestError("not_found", "Track not found: {0}".format(track_id))

    def _normalize_monitoring_state(self, monitoring_state):
        if isinstance(monitoring_state, str):
            normalized = monitoring_state.strip().lower()
            labels = {
                "in": 0,
                "on": 0,
                "auto": 1,
                "off": 2,
            }
            if normalized in labels:
                return labels[normalized]
        try:
            return int(monitoring_state)
        except (TypeError, ValueError):
            raise RequestError("invalid_argument", "Unsupported monitoring_state: {0}".format(monitoring_state))

    def _set_routing_value(self, track, attribute_name, requested_value):
        if requested_value is None:
            return
        if not hasattr(track, attribute_name):
            raise RequestError("unsupported_runtime", "Track routing field is unavailable: {0}".format(attribute_name))

        selected_value = requested_value
        available_attribute = "available_{0}s".format(attribute_name)
        available_values = getattr(track, available_attribute, None)
        if available_values is not None:
            selected_value = self._resolve_routing_choice(available_values, requested_value, attribute_name)
        setattr(track, attribute_name, selected_value)

    def _resolve_routing_choice(self, available_values, requested_value, attribute_name):
        if isinstance(requested_value, dict):
            return requested_value
        normalized_requested = str(requested_value).strip().lower()
        if isinstance(available_values, dict):
            candidates = list(available_values.get("available_{0}s".format(attribute_name), []))
        else:
            candidates = list(available_values)

        for candidate in candidates:
            if isinstance(candidate, dict):
                display_name = str(candidate.get("display_name", "")).strip().lower()
                identifier = str(candidate.get("identifier", "")).strip().lower()
            else:
                display_name = str(getattr(candidate, "display_name", candidate)).strip().lower()
                identifier = str(getattr(candidate, "identifier", candidate)).strip().lower()
            if normalized_requested == display_name or normalized_requested == identifier:
                return candidate
        raise RequestError("not_found", "Routing choice not found for {0}: {1}".format(attribute_name, requested_value))

    def _find_clip_slot(self, track, slot_index):
        if slot_index is None:
            raise RequestError("invalid_argument", "slot_index is required")
        clip_slots = getattr(track, "clip_slots", [])
        if slot_index < 0 or slot_index >= len(clip_slots):
            raise RequestError("not_found", "Clip slot not found: {0}".format(slot_index))
        return clip_slots[slot_index]

    def _find_clip(self, clip_id):
        for track_index, track in enumerate(getattr(self.song, "tracks", [])):
            track_id = getattr(track, "id", None) or _track_id(track_index)
            for slot_index, slot in enumerate(getattr(track, "clip_slots", [])):
                if not getattr(slot, "has_clip", False):
                    continue
                current_clip = slot.clip
                candidate = getattr(current_clip, "id", None) or _clip_id(track_id, slot_index)
                if candidate == clip_id:
                    return current_clip, track_id, slot_index
        raise RequestError("not_found", "Clip not found: {0}".format(clip_id))

    def _find_arrangement_clip(self, clip_id):
        for track_index, track in enumerate(getattr(self.song, "tracks", [])):
            track_id = getattr(track, "id", None) or _track_id(track_index)
            for arrangement_index, clip in enumerate(self._get_arrangement_clips(track)):
                candidate = getattr(clip, "id", None) or _arrangement_clip_id(track_id, arrangement_index)
                if candidate == clip_id:
                    return clip, track_id, arrangement_index
        raise RequestError("not_found", "Arrangement clip not found: {0}".format(clip_id))

    def _get_arrangement_clips(self, track):
        try:
            return list(getattr(track, "arrangement_clips", []) or [])
        except Exception:
            return []

    def _find_clip_slot_by_id(self, clip_id):
        for track_index, track in enumerate(getattr(self.song, "tracks", [])):
            track_id = getattr(track, "id", None) or _track_id(track_index)
            for slot_index, slot in enumerate(getattr(track, "clip_slots", [])):
                if not getattr(slot, "has_clip", False):
                    continue
                current_clip = slot.clip
                candidate = getattr(current_clip, "id", None) or _clip_id(track_id, slot_index)
                if candidate == clip_id:
                    return slot
        raise RequestError("not_found", "Clip slot not found for clip: {0}".format(clip_id))

    def _ensure_slot_is_empty(self, slot, slot_index):
        if getattr(slot, "has_clip", False):
            raise RequestError("invalid_argument", "Target clip slot already contains a clip: {0}".format(slot_index))

    def _ensure_target_slot_is_distinct(self, source_track_id, source_slot_index, target_track_id, target_slot_index):
        if source_track_id == target_track_id and int(source_slot_index) == int(target_slot_index):
            raise RequestError("invalid_argument", "Target slot must differ from the source clip slot")

    def _ensure_arrangement_track(self, track_section):
        if track_section != "visible":
            raise RequestError(
                "invalid_argument",
                "Arrangement clips are only supported on visible tracks",
            )

    def _find_clip_reference(self, clip_id):
        if isinstance(clip_id, str) and clip_id.startswith("clip:arrangement:"):
            clip, track_id, arrangement_index = self._find_arrangement_clip(clip_id)
            return {
                "clip": clip,
                "clip_id": clip_id,
                "track_id": track_id,
                "location": "arrangement",
                "arrangement_index": arrangement_index,
                "slot_index": None,
            }

        clip, track_id, slot_index = self._find_clip(clip_id)
        return {
            "clip": clip,
            "clip_id": clip_id,
            "track_id": track_id,
            "location": "session",
            "arrangement_index": None,
            "slot_index": slot_index,
        }

    def _serialize_clip_reference(self, clip_ref):
        if clip_ref["location"] == "arrangement":
            return self._serialize_arrangement_clip(
                clip_ref["clip"],
                clip_ref["track_id"],
                clip_ref["arrangement_index"],
            )
        return self._serialize_clip(
            clip_ref["clip"],
            clip_ref["track_id"],
            clip_ref["slot_index"],
        )

    def _clip_delete_result(self, clip_ref, applied):
        return {
            "applied": applied,
            "clip_id": clip_ref["clip_id"],
            "track_id": clip_ref["track_id"],
            "location": clip_ref["location"],
            "slot_index": clip_ref["slot_index"],
            "arrangement_index": clip_ref["arrangement_index"],
        }

    def _latest_arrangement_clip(self, track):
        arrangement_clips = self._get_arrangement_clips(track)
        if not arrangement_clips:
            raise RequestError("runtime_error", "Arrangement clip was not created")
        arrangement_index = len(arrangement_clips) - 1
        return arrangement_clips[arrangement_index], arrangement_index

    def _move_arrangement_clip_runtime(self, clip_ref, track, destination_beats):
        clip = clip_ref["clip"]
        length_beats = self._arrangement_clip_length_beats(clip)
        if self._set_arrangement_clip_position(clip, destination_beats, length_beats):
            return clip, self._find_arrangement_clip_index(track, clip)
        return self._move_arrangement_clip_fallback(clip_ref, destination_beats)

    def _set_arrangement_clip_position(self, clip, destination_beats, length_beats):
        if not hasattr(clip, "start_time"):
            return False
        try:
            self._set_clip_attribute(clip, "start_time", float(destination_beats))
            if hasattr(clip, "end_time"):
                self._set_clip_attribute(clip, "end_time", float(destination_beats) + float(length_beats))
            return True
        except Exception:
            return False

    def _arrangement_clip_length_beats(self, clip):
        start_beats = getattr(clip, "start_time", 0.0)
        end_beats = getattr(clip, "end_time", None)
        if end_beats is not None:
            length = float(end_beats) - float(start_beats)
            if length > 0:
                return length
        loop_end = getattr(clip, "loop_end", None)
        loop_start = getattr(clip, "loop_start", 0.0)
        if loop_end is not None:
            length = float(loop_end) - float(loop_start)
            if length > 0:
                return length
        clip_length = getattr(clip, "length", None)
        if clip_length is not None and float(clip_length) > 0:
            return float(clip_length)
        return 4.0

    def _find_arrangement_clip_index(self, track, target_clip):
        arrangement_clips = self._get_arrangement_clips(track)
        for arrangement_index, clip in enumerate(arrangement_clips):
            if clip is target_clip:
                return arrangement_index
        raise RequestError("runtime_error", "Arrangement clip could not be located after mutation")

    def _create_arrangement_clip_fallback(self, track, track_id, start_beats, length_beats, name=None):
        slot_index = self._first_empty_clip_slot_index(track)
        created_scene_index = None

        if slot_index is None:
            create_scene = getattr(self.song, "create_scene", None)
            if not callable(create_scene):
                raise RequestError("unsupported_runtime", "Arrangement clip creation is unavailable")
            created_scene_index = len(getattr(self.song, "scenes", []))
            create_scene(created_scene_index)
            slot_index = created_scene_index

        try:
            slot = self._find_clip_slot(track, slot_index)
            self._ensure_slot_is_empty(slot, slot_index)
            slot.create_clip(length_beats)
            temp_clip = slot.clip
            if temp_clip is None:
                raise RequestError("runtime_error", "Temporary clip creation failed")
            if name:
                temp_clip.name = name

            duplication = self.duplicate_clip_to_arrangement(
                _clip_id(track_id, slot_index),
                start_beats,
                target_track_id=track_id,
                dry_run=False,
            )
            clip = self._find_clip_reference(duplication["clip"]["id"])["clip"]
            arrangement_index = duplication["clip"]["arrangement_index"]
            return clip, arrangement_index
        finally:
            self._cleanup_temporary_session_clip(track, slot_index, created_scene_index)

    def _preview_duplicate_clip(self, source_clip, target_slot_index):
        preview = type("PreviewClip", (), {})()
        preview.name = getattr(source_clip, "name", "Clip {0}".format(target_slot_index + 1))
        preview.length = getattr(source_clip, "length", None)
        preview.looping = bool(getattr(source_clip, "looping", True))
        preview.loop_start = getattr(source_clip, "loop_start", 0.0)
        preview.loop_end = getattr(source_clip, "loop_end", getattr(source_clip, "length", None))
        preview.is_playing = False
        preview.notes = list(self._clip_notes.serialize_notes(source_clip))
        return preview

    def _preview_arrangement_clip(self, start_beats, length_beats=4, name=None):
        preview = self._preview_clip(length_beats=length_beats, name=name)
        preview.start_time = float(start_beats)
        preview.end_time = float(start_beats) + float(length_beats)
        return preview

    def _first_empty_clip_slot_index(self, track):
        for slot_index, slot in enumerate(getattr(track, "clip_slots", [])):
            if not getattr(slot, "has_clip", False):
                return slot_index
        return None

    def _preview_duplicate_arrangement_clip(self, source_clip, destination_beats):
        preview = self._preview_clip(
            length_beats=getattr(source_clip, "length", 4),
            name=getattr(source_clip, "name", "Preview Clip"),
        )
        preview.looping = bool(getattr(source_clip, "looping", True))
        preview.loop_start = getattr(source_clip, "loop_start", 0.0)
        preview.loop_end = getattr(source_clip, "loop_end", getattr(source_clip, "length", None))
        preview.notes = list(self._clip_notes.serialize_notes(source_clip))
        preview.start_time = float(destination_beats)
        preview.end_time = float(destination_beats) + float(getattr(source_clip, "length", 4) or 4)
        return preview

    def _duplicate_clip_to_slot(self, source_slot, source_clip, target_slot):
        duplicate_clip_to = getattr(source_slot, "duplicate_clip_to", None)
        if callable(duplicate_clip_to):
            duplicate_clip_to(target_slot)
            if getattr(target_slot, "clip", None) is not None:
                return target_slot.clip

        target_slot.create_clip(getattr(source_clip, "length", 4))
        duplicated_clip = target_slot.clip
        duplicated_clip.name = getattr(source_clip, "name", duplicated_clip.name)
        if hasattr(duplicated_clip, "looping"):
            duplicated_clip.looping = bool(getattr(source_clip, "looping", True))
        if hasattr(duplicated_clip, "loop_start"):
            duplicated_clip.loop_start = getattr(source_clip, "loop_start", 0.0)
        if hasattr(duplicated_clip, "loop_end"):
            duplicated_clip.loop_end = getattr(source_clip, "loop_end", getattr(source_clip, "length", None))
        self._clip_notes.replace_notes(
            duplicated_clip,
            [self._clip_notes.normalize_input(note) for note in self._clip_notes.serialize_notes(source_clip)],
        )
        return duplicated_clip

    def _duplicate_clip_to_arrangement_fallback(self, target_track, source_clip, destination_beats):
        arrangement_clips = self._get_arrangement_clips(target_track)
        duplicated_clip = self._preview_duplicate_arrangement_clip(source_clip, destination_beats)
        arrangement_clips.append(duplicated_clip)
        setattr(target_track, "arrangement_clips", arrangement_clips)
        arrangement_index = len(arrangement_clips) - 1
        return duplicated_clip, arrangement_index

    def _move_arrangement_clip_fallback(self, clip_ref, destination_beats):
        duplicated = self.duplicate_clip_to_arrangement(
            clip_ref["clip_id"],
            destination_beats,
            target_track_id=clip_ref["track_id"],
            dry_run=False,
        )
        duplicated_ref = self._find_clip_reference(duplicated["clip"]["id"])
        self.delete_clip(clip_ref["clip_id"], dry_run=False)
        track, _track_index, _track_section = self._find_track(clip_ref["track_id"])
        arrangement_index = self._find_arrangement_clip_index(track, duplicated_ref["clip"])
        return duplicated_ref["clip"], arrangement_index

    def _cleanup_temporary_session_clip(self, track, slot_index, created_scene_index=None):
        try:
            slot = self._find_clip_slot(track, slot_index)
        except RequestError:
            slot = None

        if slot is not None and getattr(slot, "has_clip", False):
            delete_clip = getattr(slot, "delete_clip", None)
            if callable(delete_clip):
                delete_clip()
            else:
                slot.clip = None

        if created_scene_index is None:
            return

        delete_scene = getattr(self.song, "delete_scene", None)
        if callable(delete_scene):
            try:
                delete_scene(created_scene_index)
            except Exception:
                pass

    def _preview_track(self, index, name=None, section="visible"):
        preview = type("PreviewTrack", (), {})()
        preview.name = name or "Track {0}".format(index + 1)
        preview.section = section
        preview.type = "audio" if section == "return" else "midi"
        preview.arm = False
        preview.mute = False
        preview.solo = False
        preview.can_be_armed = section == "visible"
        preview.has_audio_input = section != "visible"
        preview.has_audio_output = True
        preview.has_midi_input = section == "visible"
        preview.has_midi_output = section == "visible"
        preview.current_monitoring_state = 1 if section == "visible" else None
        preview.playing_slot_index = None
        preview.fired_slot_index = None
        preview.mixer_device = type("PreviewMixerDevice", (), {})()
        preview.mixer_device.volume = type("PreviewParameter", (), {"value": 0.85, "min": 0.0, "max": 1.0, "is_quantized": False, "display_value": "0.85", "name": "Volume"})()
        preview.mixer_device.panning = type("PreviewParameter", (), {"value": 0.0, "min": -1.0, "max": 1.0, "is_quantized": False, "display_value": "0.0", "name": "Panning"})()
        preview.mixer_device.sends = []
        preview.clip_slots = []
        preview.devices = []
        return preview

    def _normalize_return_track_name(self, name, index):
        if name is None:
            return None
        normalized_name = str(name).strip()
        if not normalized_name:
            return normalized_name
        prefix = "{0}-".format(chr(ord("A") + index))
        while normalized_name.startswith(prefix):
            normalized_name = normalized_name[len(prefix) :]
        return normalized_name or str(name).strip()

    def _preview_scene(self, index, name=None):
        preview = type("PreviewScene", (), {})()
        preview.name = name or "Scene {0}".format(index + 1)
        return preview

    def _preview_clip(self, length_beats=4, name=None):
        preview = type("PreviewClip", (), {})()
        preview.name = name or "Preview Clip"
        preview.length = length_beats
        preview.looping = True
        preview.loop_start = 0.0
        preview.loop_end = length_beats
        preview.is_playing = False
        preview.notes = []
        return preview

    def _set_clip_attribute(self, clip, attribute_name, value):
        if not hasattr(clip, attribute_name):
            return
        try:
            setattr(clip, attribute_name, value)
        except (AttributeError, TypeError):
            raise RequestError(
                "unsupported_operation",
                "Clip attribute is not writable in this Live runtime: {0}".format(attribute_name),
            )

    def _find_scene(self, scene_id):
        for index, scene in enumerate(getattr(self.song, "scenes", [])):
            candidate = getattr(scene, "id", None) or _scene_id(index)
            if candidate == scene_id:
                return scene, index
        raise RequestError("not_found", "Scene not found: {0}".format(scene_id))

    def _find_device(self, device_id):
        for section, track_index, track in self._iter_tracks():
            track_id = getattr(track, "id", None) or _track_id(track_index, section)
            for device_index, device in enumerate(getattr(track, "devices", [])):
                candidate = getattr(device, "id", None) or _device_id(track_id, device_index)
                if candidate == device_id:
                    return device, track_id, device_index
        raise RequestError("not_found", "Device not found: {0}".format(device_id))

    def _find_parameter(self, parameter_id):
        for section, track_index, track in self._iter_tracks():
            track_id = getattr(track, "id", None) or _track_id(track_index, section)
            for device_index, device in enumerate(getattr(track, "devices", [])):
                device_id = getattr(device, "id", None) or _device_id(track_id, device_index)
                for parameter_index, parameter in enumerate(getattr(device, "parameters", [])):
                    candidate = getattr(parameter, "id", None) or _parameter_id(device_id, parameter_index)
                    if candidate == parameter_id:
                        return parameter, device_id, parameter_index
        raise RequestError("not_found", "Parameter not found: {0}".format(parameter_id))

    def _browser_is_available(self):
        try:
            self._browser()
            return True
        except RequestError:
            return False

    def _browser(self):
        app = self.application
        if callable(app):
            app = app()
        if app is None:
            raise RequestError("unsupported_runtime", "Live application browser is unavailable")
        browser = getattr(app, "browser", None)
        if browser is None:
            raise RequestError("unsupported_runtime", "Live application browser is unavailable")
        return browser

    def _browser_root_items(self, browser):
        roots = []
        for category_name in (
            "instruments",
            "sounds",
            "drums",
            "audio_effects",
            "midi_effects",
            "max_for_live",
            "plugins",
            "clips",
            "samples",
            "user_library",
            "places",
        ):
            if hasattr(browser, category_name):
                item = getattr(browser, category_name)
                if item is not None:
                    roots.append((category_name, item))
        return roots

    def _browser_children(self, item):
        children = getattr(item, "children", None)
        if children is None:
            return []
        return list(children)

    def _browser_item_name(self, item, fallback):
        return getattr(item, "name", fallback)

    def _browser_item_is_folder(self, item):
        return bool(self._browser_children(item))

    def _serialize_browser_item(self, item, path=None):
        return {
            "name": self._browser_item_name(item, "Unknown"),
            "path": path,
            "uri": getattr(item, "uri", None),
            "is_folder": self._browser_item_is_folder(item),
            "is_device": bool(getattr(item, "is_device", False)),
            "is_loadable": bool(getattr(item, "is_loadable", False)),
        }

    def _find_browser_item_by_uri(self, browser_or_item, uri, max_depth=10, current_depth=0):
        if browser_or_item is None or uri is None:
            return None
        if hasattr(browser_or_item, "uri") and getattr(browser_or_item, "uri", None) == uri:
            return browser_or_item
        if current_depth >= max_depth:
            return None

        if current_depth == 0:
            for _category_name, category in self._browser_root_items(browser_or_item):
                item = self._find_browser_item_by_uri(category, uri, max_depth=max_depth, current_depth=current_depth + 1)
                if item is not None:
                    return item

        for child in self._browser_children(browser_or_item):
            item = self._find_browser_item_by_uri(child, uri, max_depth=max_depth, current_depth=current_depth + 1)
            if item is not None:
                return item

        return None

    def _find_browser_item_by_path(self, browser, path):
        path_parts = [part for part in str(path or "").split("/") if part]
        if not path_parts:
            raise RequestError("invalid_argument", "path is required")

        root_name = path_parts[0].lower()
        current_item = None
        for category_name, category in self._browser_root_items(browser):
            if category_name.lower() == root_name:
                current_item = category
                break

        if current_item is None:
            raise RequestError("not_found", "Unknown browser root: {0}".format(root_name))

        for path_part in path_parts[1:]:
            next_item = None
            for child in self._browser_children(current_item):
                if self._browser_item_name(child, "").lower() == path_part.lower():
                    next_item = child
                    break
            if next_item is None:
                raise RequestError("not_found", "Browser path not found: {0}".format(path))
            current_item = next_item

        return current_item

    def _join_browser_path(self, base_path, name):
        if not base_path:
            return name
        return "{0}/{1}".format(base_path.rstrip("/"), name)

    def _mark_clip_playing(self, target_track_id, target_slot_index):
        for track_index, track in enumerate(getattr(self.song, "tracks", [])):
            track_id = getattr(track, "id", None) or _track_id(track_index)
            for slot_index, slot in enumerate(getattr(track, "clip_slots", [])):
                if not getattr(slot, "has_clip", False):
                    continue
                slot.clip.is_playing = track_id == target_track_id and slot_index == target_slot_index
        start_playing = getattr(self.song, "start_playing", None)
        if callable(start_playing):
            start_playing()

    def _mark_scene_playing(self, scene_index):
        for track in getattr(self.song, "tracks", []):
            target_slot = None
            clip_slots = getattr(track, "clip_slots", [])
            for slot_index, slot in enumerate(clip_slots):
                if not getattr(slot, "has_clip", False):
                    continue
                is_target = slot_index == scene_index
                slot.clip.is_playing = is_target
                if is_target:
                    target_slot = slot
            if target_slot is None:
                self._clear_track_clip_state(track)
        start_playing = getattr(self.song, "start_playing", None)
        if callable(start_playing):
            start_playing()

    def _clear_track_clip_state(self, track):
        for slot in getattr(track, "clip_slots", []):
            if getattr(slot, "has_clip", False):
                slot.clip.is_playing = False
