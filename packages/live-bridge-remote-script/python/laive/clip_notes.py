from __future__ import absolute_import, print_function, unicode_literals

from .protocol import RequestError


class ClipNoteAdapter(object):
    def __init__(self, live_module=None):
        self._live_module = live_module

    def normalize_input(self, note):
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

    def serialize_notes(self, clip):
        return [self._normalize_runtime_note(note) for note in self.read_notes(clip)]

    def count_notes(self, clip):
        return len(self.read_notes(clip))

    def read_notes(self, clip):
        for reader in (
            self._read_all_notes_extended,
            self._read_notes_extended,
            self._read_all_notes,
            self._read_clip_notes_property,
        ):
            notes = reader(clip)
            if notes is not None:
                return notes

        return []

    def write_notes(self, clip, notes):
        normalized_notes = self._normalize_notes(notes)

        if hasattr(clip, "add_new_notes"):
            try:
                clip.add_new_notes(self._extended_note_payload(normalized_notes))
                return normalized_notes
            except Exception as error:
                raise RequestError("runtime_error", "add_new_notes failed: {0}".format(error))

        if hasattr(clip, "set_notes"):
            tuple_error = self._try_set_notes_tuple(clip, normalized_notes)
            if tuple_error is None:
                return normalized_notes

            if not self.supports_legacy_set_notes(clip):
                raise RequestError("runtime_error", "set_notes failed: {0}".format(tuple_error))

        if self.supports_legacy_set_notes(clip):
            self._set_notes_sequence(clip, normalized_notes)
            return normalized_notes

        notes_property = getattr(clip, "notes", None)
        if isinstance(notes_property, list):
            notes_property.extend([self._legacy_tuple_note(note) for note in normalized_notes])
            return normalized_notes

        raise RequestError("unsupported_runtime", "Clip does not expose a supported note write API")

    def replace_notes(self, clip, notes):
        normalized_notes = self._normalize_notes(notes)

        if hasattr(clip, "add_new_notes") and (
            hasattr(clip, "remove_notes_by_id") or hasattr(clip, "remove_notes_extended")
        ):
            self._replace_all_notes_extended(clip, normalized_notes)
            return normalized_notes

        if self.supports_replace_selected_notes(clip):
            self._replace_selected_notes_sequence(clip, normalized_notes)
            return normalized_notes

        if hasattr(clip, "set_notes"):
            tuple_error = self._try_set_notes_tuple(clip, normalized_notes)
            if tuple_error is None:
                return normalized_notes

            if self.supports_legacy_set_notes(clip):
                self._set_notes_sequence(clip, normalized_notes)
                return normalized_notes

            raise RequestError("runtime_error", "replace_notes failed: {0}".format(tuple_error))

        if self.supports_legacy_set_notes(clip):
            self._set_notes_sequence(clip, normalized_notes)
            return normalized_notes

        notes_property = getattr(clip, "notes", None)
        if isinstance(notes_property, list):
            notes_property[:] = [self._legacy_tuple_note(note) for note in normalized_notes]
            return normalized_notes

        if hasattr(clip, "stored_notes"):
            clip.stored_notes = [self._legacy_tuple_note(note) for note in normalized_notes]
            return normalized_notes

        raise RequestError("unsupported_runtime", "Clip does not expose a supported note replacement API")

    def supports_legacy_set_notes(self, clip):
        return all(hasattr(clip, method_name) for method_name in ("set_notes", "notes", "note", "done"))

    def supports_replace_selected_notes(self, clip):
        return all(hasattr(clip, method_name) for method_name in ("replace_selected_notes", "notes", "note", "done"))

    def _normalize_notes(self, notes):
        return [self.normalize_input(note) for note in notes]

    def _read_all_notes_extended(self, clip):
        getter = getattr(clip, "get_all_notes_extended", None)
        if getter is None:
            return None

        try:
            return self._coerce_note_list(getter())
        except TypeError:
            return None
        except Exception as error:
            raise RequestError("runtime_error", "get_all_notes_extended failed: {0}".format(error))

    def _read_notes_extended(self, clip):
        getter = getattr(clip, "get_notes_extended", None)
        if getter is None:
            return None

        time_span = self._clip_time_span(clip)
        candidate_queries = (
            ({"from_pitch": 0, "pitch_span": 128, "from_time": 0.0, "time_span": time_span},),
            (0, 128, 0.0, time_span),
        )

        for query_args in candidate_queries:
            try:
                return self._coerce_note_list(getter(*query_args))
            except TypeError:
                continue
            except Exception as error:
                raise RequestError("runtime_error", "get_notes_extended failed: {0}".format(error))

        return None

    def _read_all_notes(self, clip):
        getter = getattr(clip, "get_all_notes", None)
        if getter is None:
            return None

        try:
            return self._coerce_note_list(getter())
        except TypeError:
            return None
        except Exception as error:
            raise RequestError("runtime_error", "get_all_notes failed: {0}".format(error))

    def _read_clip_notes_property(self, clip):
        notes = getattr(clip, "notes", None)
        if notes is None:
            if hasattr(clip, "stored_notes"):
                return list(getattr(clip, "stored_notes", []))
            return None

        if callable(notes):
            return list(getattr(clip, "stored_notes", []))

        return list(notes)

    def _coerce_note_list(self, payload):
        if payload is None:
            return []

        if isinstance(payload, dict):
            for key in ("notes", "note_descriptions", "result"):
                value = payload.get(key)
                if isinstance(value, (list, tuple)):
                    return list(value)
            return []

        if isinstance(payload, (list, tuple)):
            return list(payload)

        try:
            return list(payload)
        except TypeError:
            return []

    def _normalize_runtime_note(self, note):
        if isinstance(note, dict):
            normalized = self.normalize_input(note)
            for key in ("note_id", "id"):
                if key in note:
                    normalized["id"] = note[key]
                    break
            return normalized

        if isinstance(note, (list, tuple)):
            normalized = {
                "pitch": note[0] if len(note) > 0 else 60,
                "start_time": note[1] if len(note) > 1 else 0.0,
                "duration": note[2] if len(note) > 2 else 0.25,
                "velocity": note[3] if len(note) > 3 else 100,
                "mute": bool(note[4]) if len(note) > 4 else False,
            }
            if len(note) > 5:
                normalized["probability"] = note[5]
            if len(note) > 6:
                normalized["velocity_deviation"] = note[6]
            if len(note) > 7:
                normalized["release_velocity"] = note[7]
            if len(note) > 8:
                normalized["id"] = note[8]
            return normalized

        normalized = {
            "pitch": getattr(note, "pitch", 60),
            "start_time": getattr(note, "start_time", 0.0),
            "duration": getattr(note, "duration", 0.25),
            "velocity": getattr(note, "velocity", 100),
            "mute": bool(getattr(note, "mute", False)),
        }

        for source_attr, target_key in (
            ("probability", "probability"),
            ("velocity_deviation", "velocity_deviation"),
            ("release_velocity", "release_velocity"),
            ("note_id", "id"),
            ("id", "id"),
        ):
            value = getattr(note, source_attr, None)
            if value is not None:
                normalized[target_key] = value

        return normalized

    def _clip_time_span(self, clip):
        length = getattr(clip, "length", None)
        if isinstance(length, (int, float)) and length > 0:
            return float(length)

        loop_end = getattr(clip, "loop_end", None)
        if isinstance(loop_end, (int, float)) and loop_end > 0:
            return float(loop_end)

        return 1024.0

    def _try_set_notes_tuple(self, clip, normalized_notes):
        try:
            clip.set_notes(tuple(self._legacy_tuple_note(note) for note in normalized_notes))
            return None
        except TypeError as error:
            return error
        except Exception as error:
            raise RequestError("runtime_error", "set_notes failed: {0}".format(error))

    def _set_notes_sequence(self, clip, notes):
        try:
            clip.set_notes()
        except Exception as error:
            raise RequestError("runtime_error", "legacy set_notes sequence failed at set_notes: {0}".format(error))

        try:
            clip.notes(len(notes))
        except Exception as error:
            raise RequestError("runtime_error", "legacy set_notes sequence failed at notes(count): {0}".format(error))

        for note in notes:
            try:
                clip.note(
                    note.get("pitch", 60),
                    note.get("start_time", 0.0),
                    note.get("duration", 0.25),
                    note.get("velocity", 100),
                    bool(note.get("mute", False)),
                )
            except Exception as error:
                raise RequestError(
                    "runtime_error",
                    "legacy set_notes sequence failed at note(...): {0}".format(error),
                )

        try:
            clip.done()
        except Exception as error:
            raise RequestError("runtime_error", "legacy set_notes sequence failed at done(): {0}".format(error))

    def _replace_selected_notes_sequence(self, clip, notes):
        select_all_notes = getattr(clip, "select_all_notes", None)
        if callable(select_all_notes):
            try:
                select_all_notes()
            except Exception as error:
                raise RequestError(
                    "runtime_error",
                    "replace_selected_notes sequence failed at select_all_notes(): {0}".format(error),
                )

        try:
            clip.replace_selected_notes()
        except Exception as error:
            raise RequestError(
                "runtime_error",
                "replace_selected_notes sequence failed at replace_selected_notes(): {0}".format(error),
            )

        try:
            clip.notes(len(notes))
        except Exception as error:
            raise RequestError(
                "runtime_error",
                "replace_selected_notes sequence failed at notes(count): {0}".format(error),
            )

        for note in notes:
            try:
                clip.note(
                    note.get("pitch", 60),
                    note.get("start_time", 0.0),
                    note.get("duration", 0.25),
                    note.get("velocity", 100),
                    bool(note.get("mute", False)),
                )
            except Exception as error:
                raise RequestError(
                    "runtime_error",
                    "replace_selected_notes sequence failed at note(...): {0}".format(error),
                )

        try:
            clip.done()
        except Exception as error:
            raise RequestError(
                "runtime_error",
                "replace_selected_notes sequence failed at done(): {0}".format(error),
            )

        deselect_all_notes = getattr(clip, "deselect_all_notes", None)
        if callable(deselect_all_notes):
            try:
                deselect_all_notes()
            except Exception:
                return None

    def _legacy_tuple_note(self, note):
        return (
            note.get("pitch", 60),
            note.get("start_time", 0.0),
            note.get("duration", 0.25),
            note.get("velocity", 100),
            bool(note.get("mute", False)),
        )

    def _extended_note_payload(self, notes):
        return {"notes": [self._extended_note_spec(note) for note in notes]}

    def _extended_note_spec(self, note):
        payload = {
            "pitch": note.get("pitch", 60),
            "start_time": note.get("start_time", 0.0),
            "duration": note.get("duration", 0.25),
            "velocity": note.get("velocity", 100),
            "mute": bool(note.get("mute", False)),
        }

        for source_key, target_key, default_value in (
            ("probability", "probability", 1.0),
            ("velocity_deviation", "velocity_deviation", 0.0),
            ("release_velocity", "release_velocity", 64),
        ):
            value = note.get(source_key, default_value)
            if value is not None:
                payload[target_key] = value

        return payload

    def _replace_all_notes_extended(self, clip, notes):
        existing_notes = [self._normalize_runtime_note(note) for note in self.read_notes(clip)]
        removable_note_ids = [note.get("id") for note in existing_notes if note.get("id") is not None]

        if removable_note_ids and hasattr(clip, "remove_notes_by_id"):
            self._remove_notes_by_id(clip, removable_note_ids)
        elif existing_notes and hasattr(clip, "remove_notes_extended"):
            self._remove_notes_extended(clip)

        remaining_notes = [self._normalize_runtime_note(note) for note in self.read_notes(clip)]
        if remaining_notes:
            raise RequestError(
                "runtime_error",
                "extended note clear step left {0} notes in the clip".format(len(remaining_notes)),
            )

        if not notes:
            return None

        try:
            clip.add_new_notes(self._extended_note_payload(notes))
        except Exception as error:
            raise RequestError("runtime_error", "add_new_notes failed after clearing notes: {0}".format(error))

    def _remove_notes_by_id(self, clip, note_ids):
        last_type_error = None
        for candidate_args in ((note_ids,), ({"note_ids": note_ids},)):
            try:
                clip.remove_notes_by_id(*candidate_args)
                return None
            except TypeError as error:
                last_type_error = error
                continue
            except Exception as error:
                raise RequestError("runtime_error", "remove_notes_by_id failed: {0}".format(error))

        if last_type_error is not None:
            raise RequestError("runtime_error", "remove_notes_by_id failed: {0}".format(last_type_error))

    def _remove_notes_extended(self, clip):
        time_span = self._clip_time_span(clip)
        candidate_args = (
            ({"from_pitch": 0, "pitch_span": 128, "from_time": 0.0, "time_span": time_span},),
            (0, 128, 0.0, time_span),
        )
        last_type_error = None

        for args in candidate_args:
            try:
                clip.remove_notes_extended(*args)
                return None
            except TypeError as error:
                last_type_error = error
                continue
            except Exception as error:
                raise RequestError("runtime_error", "remove_notes_extended failed: {0}".format(error))

        if last_type_error is not None:
            raise RequestError("runtime_error", "remove_notes_extended failed: {0}".format(last_type_error))
