from __future__ import absolute_import, print_function, unicode_literals

from .protocol import RequestError


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
    def __init__(self, song):
        self.song = song

    @property
    def live_version(self):
        return getattr(self.song, "live_version", "unknown")

    def capabilities(self):
        return {
            "read_state": True,
            "set_transport": True,
            "create_track": hasattr(self.song, "create_midi_track"),
            "create_scene": hasattr(self.song, "create_scene"),
            "create_clip": True,
            "insert_notes": True,
            "set_parameter": True,
            "subscribe": True,
        }

    def get_song_state(self):
        return {
            "id": "song:current",
            "name": getattr(self.song, "name", "Untitled Set"),
            "tempo": getattr(self.song, "tempo", None),
            "time_signature_numerator": getattr(self.song, "signature_numerator", None),
            "time_signature_denominator": getattr(self.song, "signature_denominator", None),
            "is_playing": bool(getattr(self.song, "is_playing", False)),
            "is_recording": bool(getattr(self.song, "is_recording", False)),
            "metronome": bool(getattr(self.song, "metronome", False)),
        }

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
        normalized_notes = [self._note_spec(note) for note in notes]
        if not dry_run:
            if hasattr(clip, "add_new_notes"):
                clip.add_new_notes({"notes": normalized_notes})
            elif hasattr(clip, "set_notes"):
                clip.set_notes(tuple(normalized_notes))
            else:
                clip.notes.extend(normalized_notes)
        note_count = len(notes)
        clip_state = self._serialize_clip(clip, track_id, slot_index)
        clip_state["note_count"] = len(getattr(clip, "notes", [])) if not dry_run else note_count
        return {"applied": not dry_run, "clip": clip_state, "note_count": note_count}

    def _serialize_track(self, track, index):
        track_id = getattr(track, "id", None) or _track_id(index)
        clip_slots = getattr(track, "clip_slots", [])
        devices = getattr(track, "devices", [])
        return {
            "id": track_id,
            "index": index,
            "name": getattr(track, "name", "Track {0}".format(index + 1)),
            "type": getattr(track, "type", "midi"),
            "arm": bool(getattr(track, "arm", False)),
            "mute": bool(getattr(track, "mute", False)),
            "solo": bool(getattr(track, "solo", False)),
            "session_clips": [
                self._serialize_clip(slot.clip, track_id, slot_index)
                for slot_index, slot in enumerate(clip_slots)
                if getattr(slot, "has_clip", False)
            ],
            "devices": [self._serialize_device(device, track_id, device_index) for device_index, device in enumerate(devices)],
        }

    def _serialize_scene(self, scene, index):
        return {
            "id": getattr(scene, "id", None) or _scene_id(index),
            "index": index,
            "name": getattr(scene, "name", "Scene {0}".format(index + 1)),
        }

    def _serialize_clip(self, clip, track_id, slot_index):
        return {
            "id": getattr(clip, "id", None) or _clip_id(track_id, slot_index),
            "slot_index": slot_index,
            "name": getattr(clip, "name", "Clip {0}".format(slot_index + 1)),
            "length_beats": getattr(clip, "length", None),
            "is_playing": bool(getattr(clip, "is_playing", False)),
            "notes": list(getattr(clip, "notes", [])),
        }

    def _serialize_device(self, device, track_id, device_index):
        device_id = getattr(device, "id", None) or _device_id(track_id, device_index)
        return {
            "id": device_id,
            "name": getattr(device, "name", "Device {0}".format(device_index + 1)),
            "class_name": getattr(device, "class_name", "Device"),
            "parameters": [
                self._serialize_parameter(parameter, device_id, parameter_index)
                for parameter_index, parameter in enumerate(getattr(device, "parameters", []))
            ],
        }

    def _serialize_parameter(self, parameter, device_id, parameter_index):
        return {
            "id": getattr(parameter, "id", None) or _parameter_id(device_id, parameter_index),
            "name": getattr(parameter, "name", "Parameter {0}".format(parameter_index + 1)),
            "value": getattr(parameter, "value", None),
            "min": getattr(parameter, "min", 0.0),
            "max": getattr(parameter, "max", 1.0),
            "display_value": getattr(parameter, "display_value", str(getattr(parameter, "value", ""))),
        }

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

    def _note_spec(self, note):
        return {
            "pitch": note.get("pitch", 60),
            "start_time": note.get("start_time", note.get("start_beats", note.get("startBeats", 0.0))),
            "duration": note.get("duration", note.get("duration_beats", note.get("durationBeats", 0.25))),
            "velocity": note.get("velocity", 100),
            "mute": bool(note.get("mute", False)),
            "probability": note.get("probability", 1.0),
            "velocity_deviation": note.get("velocity_deviation", note.get("velocityDeviation", 0.0)),
            "release_velocity": note.get("release_velocity", note.get("releaseVelocity", 64)),
        }
