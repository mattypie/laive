from __future__ import absolute_import, print_function, unicode_literals


def _safe_getattr(target, name, default=None):
    try:
        return getattr(target, name)
    except Exception:
        return default


def serialize_song_state(song):
    return {
        "id": "song:current",
        "name": getattr(song, "name", "Untitled Set"),
        "tempo": getattr(song, "tempo", None),
        "time_signature_numerator": getattr(song, "signature_numerator", None),
        "time_signature_denominator": getattr(song, "signature_denominator", None),
        "is_playing": bool(getattr(song, "is_playing", False)),
        "is_recording": bool(getattr(song, "is_recording", False)),
        "metronome": bool(getattr(song, "metronome", False)),
    }


def serialize_track_state(track, index, track_id, session_clips, devices):
    armed = bool(getattr(track, "arm", False))
    muted = bool(getattr(track, "mute", False))
    soloed = bool(getattr(track, "solo", False))
    playing_slot_index = getattr(track, "playing_slot_index", None)
    fired_slot_index = getattr(track, "fired_slot_index", None)

    return {
        "id": track_id,
        "index": index,
        "name": getattr(track, "name", "Track {0}".format(index + 1)),
        "type": getattr(track, "type", "midi"),
        "arm": armed,
        "mute": muted,
        "solo": soloed,
        "armed": armed,
        "muted": muted,
        "soloed": soloed,
        "playing_slot_index": playing_slot_index,
        "playingSlotIndex": playing_slot_index,
        "fired_slot_index": fired_slot_index,
        "firedSlotIndex": fired_slot_index,
        "session_clips": session_clips,
        "arrangement_clips": [],
        "devices": devices,
    }


def serialize_scene_state(scene, index, scene_id):
    return {
        "id": scene_id,
        "index": index,
        "name": getattr(scene, "name", "Scene {0}".format(index + 1)),
    }


def serialize_clip_state(clip, clip_id, track_id, slot_index, notes):
    loop_start = getattr(clip, "loop_start", 0.0)
    loop_end = getattr(clip, "loop_end", getattr(clip, "length", None))
    looping = bool(getattr(clip, "looping", True))
    length_beats = getattr(clip, "length", None)
    if loop_end is not None and loop_start is not None:
        try:
            length_beats = float(loop_end) - float(loop_start)
        except Exception:
            length_beats = getattr(clip, "length", None)
    return {
        "id": clip_id,
        "track_id": track_id,
        "location": "session",
        "slot_index": slot_index,
        "slotIndex": slot_index,
        "name": getattr(clip, "name", "Clip {0}".format(slot_index + 1)),
        "length_beats": length_beats,
        "loop_start_beats": loop_start,
        "loopStartBeats": loop_start,
        "loop_end_beats": loop_end,
        "loopEndBeats": loop_end,
        "looping": looping,
        "is_playing": bool(getattr(clip, "is_playing", False)),
        "notes": notes,
        "note_count": len(notes),
        "noteCount": len(notes),
    }


def serialize_device_state(device, device_id, parameters):
    return {
        "id": device_id,
        "name": getattr(device, "name", "Device"),
        "class_name": getattr(device, "class_name", "Device"),
        "parameters": parameters,
    }


def serialize_parameter_state(parameter, parameter_id):
    value = _safe_getattr(parameter, "value", None)
    display_value = _safe_getattr(parameter, "display_value", str(value if value is not None else ""))
    is_quantized = bool(_safe_getattr(parameter, "is_quantized", False))
    value_items = list(_safe_getattr(parameter, "value_items", []) or []) if is_quantized else []
    return {
        "id": parameter_id,
        "name": _safe_getattr(parameter, "name", "Parameter"),
        "value": value,
        "min": _safe_getattr(parameter, "min", 0.0),
        "max": _safe_getattr(parameter, "max", 1.0),
        "is_quantized": is_quantized,
        "isQuantized": is_quantized,
        "value_items": value_items,
        "valueItems": value_items,
        "display_value": display_value,
        "displayValue": display_value,
    }
