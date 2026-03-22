from __future__ import absolute_import, print_function, unicode_literals


def _safe_call(logger, message):
    if logger:
        logger(message)


class ListenerHub(object):
    def __init__(self, live_access, event_sink, logger=None):
        self._live_access = live_access
        self._song = live_access.song
        self._event_sink = event_sink
        self._logger = logger
        self._detach_steps = []

    def attach(self):
        self._attach_listener(self._song, "tempo", self._emit_transport_changed)
        self._attach_listener(self._song, "is_playing", self._emit_transport_changed)
        self._attach_listener(self._song, "tracks", self._emit_tracks_changed)
        self._attach_listener(self._song, "scenes", self._emit_scenes_changed)

    def detach(self):
        while self._detach_steps:
            callback = self._detach_steps.pop()
            try:
                callback()
            except Exception as error:  # pragma: no cover - defensive cleanup
                _safe_call(self._logger, "Listener detach failed: {0}".format(error))

    def _attach_listener(self, subject, name, callback):
        add_method = getattr(subject, "add_{0}_listener".format(name), None)
        remove_method = getattr(subject, "remove_{0}_listener".format(name), None)
        if not add_method or not remove_method:
            return
        add_method(callback)
        self._detach_steps.append(lambda: remove_method(callback))

    def _emit_transport_changed(self):
        self._event_sink("transport.changed", self._live_access.get_song_state())

    def _emit_tracks_changed(self):
        self._event_sink("tracks.changed", {"tracks": self._live_access.get_tracks()})

    def _emit_scenes_changed(self):
        self._event_sink("state.changed", {"scenes": self._live_access.get_scenes()})
