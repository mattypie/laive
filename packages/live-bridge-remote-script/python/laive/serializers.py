from __future__ import absolute_import, print_function, unicode_literals


def _safe_getattr(target, name, default=None):
    try:
        return getattr(target, name)
    except Exception:
        return default


def _serialize_routing_option(option):
    if option is None:
        return None

    if isinstance(option, dict):
        identifier = option.get("identifier") or option.get("id") or option.get("name")
        display_name = option.get("display_name") or option.get("displayName") or option.get("name") or identifier
        if identifier is None and display_name is None:
            return None
        return {
            "identifier": identifier or display_name,
            "display_name": display_name or identifier,
        }

    identifier = (
        _safe_getattr(option, "identifier", None)
        or _safe_getattr(option, "id", None)
        or _safe_getattr(option, "name", None)
    )
    display_name = (
        _safe_getattr(option, "display_name", None)
        or _safe_getattr(option, "displayName", None)
        or _safe_getattr(option, "name", None)
        or identifier
    )
    if identifier is None and display_name is None:
        return None
    return {
        "identifier": identifier or display_name,
        "display_name": display_name or identifier,
    }


def _serialize_routing_options(options):
    return [
        item
        for item in [_serialize_routing_option(option) for option in list(options or [])]
        if item is not None
    ]


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


def serialize_track_state(track, index, track_id, session_clips, devices, section=None):
    armed = bool(_safe_getattr(track, "arm", False))
    muted = bool(_safe_getattr(track, "mute", False))
    soloed = bool(_safe_getattr(track, "solo", False))
    playing_slot_index = _safe_getattr(track, "playing_slot_index", None)
    fired_slot_index = _safe_getattr(track, "fired_slot_index", None)
    section = section or _safe_getattr(track, "section", "visible")
    mixer_device = _safe_getattr(track, "mixer_device", None)
    sends = [
        serialize_parameter_state(send, "{0}:send:{1}".format(track_id, send_index + 1))
        for send_index, send in enumerate(getattr(mixer_device, "sends", []) or [])
    ]

    input_routing_type = _serialize_routing_option(_safe_getattr(track, "input_routing_type", None))
    input_routing_channel = _serialize_routing_option(_safe_getattr(track, "input_routing_channel", None))
    output_routing_type = _serialize_routing_option(_safe_getattr(track, "output_routing_type", None))
    output_routing_channel = _serialize_routing_option(_safe_getattr(track, "output_routing_channel", None))
    available_input_routing_types = _serialize_routing_options(
        _safe_getattr(track, "available_input_routing_types", [])
    )
    available_input_routing_channels = _serialize_routing_options(
        _safe_getattr(track, "available_input_routing_channels", [])
    )
    available_output_routing_types = _serialize_routing_options(
        _safe_getattr(track, "available_output_routing_types", [])
    )
    available_output_routing_channels = _serialize_routing_options(
        _safe_getattr(track, "available_output_routing_channels", [])
    )
    monitoring_state = _safe_getattr(
        track, "current_monitoring_state", _safe_getattr(track, "monitoring_state", None)
    )

    return {
        "id": track_id,
        "index": index,
        "section": section,
        "name": _safe_getattr(track, "name", "Track {0}".format(index + 1)),
        "type": _safe_getattr(track, "type", "midi"),
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
        "can_be_armed": bool(_safe_getattr(track, "can_be_armed", armed)),
        "has_audio_input": bool(_safe_getattr(track, "has_audio_input", False)),
        "has_audio_output": bool(_safe_getattr(track, "has_audio_output", False)),
        "has_midi_input": bool(_safe_getattr(track, "has_midi_input", False)),
        "has_midi_output": bool(_safe_getattr(track, "has_midi_output", False)),
        "monitoring_state": monitoring_state,
        "monitoringState": monitoring_state,
        "volume": _safe_getattr(_safe_getattr(mixer_device, "volume", None), "value", None),
        "panning": _safe_getattr(_safe_getattr(mixer_device, "panning", None), "value", None),
        "input_routing_type": input_routing_type,
        "inputRoutingType": input_routing_type,
        "input_routing_channel": input_routing_channel,
        "inputRoutingChannel": input_routing_channel,
        "output_routing_type": output_routing_type,
        "outputRoutingType": output_routing_type,
        "output_routing_channel": output_routing_channel,
        "outputRoutingChannel": output_routing_channel,
        "available_input_routing_types": available_input_routing_types,
        "availableInputRoutingTypes": available_input_routing_types,
        "available_input_routing_channels": available_input_routing_channels,
        "availableInputRoutingChannels": available_input_routing_channels,
        "available_output_routing_types": available_output_routing_types,
        "availableOutputRoutingTypes": available_output_routing_types,
        "available_output_routing_channels": available_output_routing_channels,
        "availableOutputRoutingChannels": available_output_routing_channels,
        "sends": sends,
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
