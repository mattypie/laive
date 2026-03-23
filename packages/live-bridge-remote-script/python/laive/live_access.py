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


def _track_id(index):
    return "track:{0}".format(index + 1)


def _scene_id(index):
    return "scene:{0}".format(index + 1)


def _clip_id(track_id, slot_index):
    return "clip:session:{0}:slot:{1}".format(track_id, slot_index + 1)


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
            "set_transport": True,
            "select_track": True,
            "create_track": hasattr(self.song, "create_midi_track"),
            "create_scene": hasattr(self.song, "create_scene"),
            "create_clip": True,
            "insert_notes": True,
            "replace_notes": True,
            "launch_clip": True,
            "launch_scene": True,
            "stop_track_clips": True,
            "stop_all_clips": True,
            "set_parameter": True,
            "browser_access": self._browser_is_available(),
            "load_browser_item": self._browser_is_available(),
            "subscribe": True,
        }

    def get_song_state(self):
        return serialize_song_state(self.song)

    def get_tracks(self):
        return [self._serialize_track(track, index) for index, track in enumerate(getattr(self.song, "tracks", []))]

    def get_scenes(self):
        return [self._serialize_scene(scene, index) for index, scene in enumerate(getattr(self.song, "scenes", []))]

    def get_track(self, track_id):
        track, index = self._find_track(track_id)
        return self._serialize_track(track, index)

    def get_clip(self, clip_id):
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

        track, index = self._find_track(track_id)
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
            "track": self._serialize_track(track, index),
        }

    def select_track(self, track_id, dry_run=False):
        track, index = self._find_track(track_id)
        song_view = getattr(self.song, "view", None)
        if song_view is None or not hasattr(song_view, "selected_track"):
            raise RequestError("unsupported_runtime", "Song track selection is unavailable")

        if not dry_run:
            song_view.selected_track = track

        return {
            "applied": not dry_run,
            "track": self._serialize_track(track, index),
        }

    def set_tempo(self, value, dry_run=False):
        tempo = float(value)
        if tempo <= 0:
            raise RequestError("invalid_argument", "tempo must be positive")
        if not dry_run:
            self.song.tempo = tempo
        return {"target": "song.tempo", "applied": not dry_run, "value": tempo}

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
            track = self.song.preview_track(index=index, name=name)
        else:
            self.song.create_midi_track(index)
            track = self.song.tracks[index]
            if name:
                track.name = name
        return {"applied": not dry_run, "track": self._serialize_track(track, index)}

    def create_scene(self, name=None, dry_run=False):
        index = len(getattr(self.song, "scenes", []))
        if dry_run:
            scene = self.song.preview_scene(index=index, name=name)
        else:
            self.song.create_scene(index)
            scene = self.song.scenes[index]
            if name:
                scene.name = name
        return {"applied": not dry_run, "scene": self._serialize_scene(scene, index)}

    def create_clip(self, track_id, slot_index, length_beats=4, name=None, dry_run=False):
        track, _track_index = self._find_track(track_id)
        slot = self._find_clip_slot(track, slot_index)
        if dry_run:
            clip = slot.preview_clip(length_beats=length_beats, name=name)
        else:
            slot.create_clip(length_beats)
            clip = slot.clip
            if name:
                clip.name = name
        return {"applied": not dry_run, "clip": self._serialize_clip(clip, track_id, slot_index)}

    def insert_notes(self, clip_id, notes, dry_run=False):
        clip, track_id, slot_index = self._find_clip(clip_id)
        normalized_notes = [self._clip_notes.normalize_input(note) for note in notes]
        if not dry_run:
            self._clip_notes.write_notes(clip, normalized_notes)
        note_count = len(notes)
        clip_state = self._serialize_clip(clip, track_id, slot_index)
        if dry_run:
            clip_state["note_count"] = note_count
            clip_state["noteCount"] = note_count
        return {"applied": not dry_run, "clip": clip_state, "note_count": note_count}

    def replace_notes(self, clip_id, notes, dry_run=False):
        clip, track_id, slot_index = self._find_clip(clip_id)
        normalized_notes = [self._clip_notes.normalize_input(note) for note in notes]
        if not dry_run:
            self._clip_notes.replace_notes(clip, normalized_notes)
        note_count = len(normalized_notes)
        clip_state = self._serialize_clip(clip, track_id, slot_index)
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
        track, index = self._find_track(track_id)
        if not dry_run:
            stop_all_clips = getattr(track, "stop_all_clips", None)
            if callable(stop_all_clips):
                stop_all_clips()
            else:
                self._clear_track_clip_state(track)
        return {"applied": not dry_run, "track": self._serialize_track(track, index)}

    def stop_all_clips(self, dry_run=False):
        if not dry_run:
            stop_all_clips = getattr(self.song, "stop_all_clips", None)
            if callable(stop_all_clips):
                stop_all_clips()
            else:
                for track in getattr(self.song, "tracks", []):
                    self._clear_track_clip_state(track)
        return {"applied": not dry_run, "song": self.get_song_state()}

    def _serialize_track(self, track, index):
        track_id = getattr(track, "id", None) or _track_id(index)
        clip_slots = getattr(track, "clip_slots", [])
        devices = getattr(track, "devices", [])
        session_clips = [
            self._serialize_clip(slot.clip, track_id, slot_index)
            for slot_index, slot in enumerate(clip_slots)
            if getattr(slot, "has_clip", False)
        ]
        serialized_devices = [
            self._serialize_device(device, track_id, device_index)
            for device_index, device in enumerate(devices)
        ]
        return serialize_track_state(track, index, track_id, session_clips, serialized_devices)

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

    def _find_track(self, track_id):
        for index, track in enumerate(getattr(self.song, "tracks", [])):
            candidate = getattr(track, "id", None) or _track_id(index)
            if candidate == track_id:
                return track, index
        raise RequestError("not_found", "Track not found: {0}".format(track_id))

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

    def _find_scene(self, scene_id):
        for index, scene in enumerate(getattr(self.song, "scenes", [])):
            candidate = getattr(scene, "id", None) or _scene_id(index)
            if candidate == scene_id:
                return scene, index
        raise RequestError("not_found", "Scene not found: {0}".format(scene_id))

    def _find_device(self, device_id):
        for track_index, track in enumerate(getattr(self.song, "tracks", [])):
            track_id = getattr(track, "id", None) or _track_id(track_index)
            for device_index, device in enumerate(getattr(track, "devices", [])):
                candidate = getattr(device, "id", None) or _device_id(track_id, device_index)
                if candidate == device_id:
                    return device, track_id, device_index
        raise RequestError("not_found", "Device not found: {0}".format(device_id))

    def _find_parameter(self, parameter_id):
        for track_index, track in enumerate(getattr(self.song, "tracks", [])):
            track_id = getattr(track, "id", None) or _track_id(track_index)
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
        for category_name in ("instruments", "sounds", "drums", "audio_effects", "midi_effects"):
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
