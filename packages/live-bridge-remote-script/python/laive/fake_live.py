from __future__ import absolute_import, print_function, unicode_literals


class ListenerMixin(object):
    def __init__(self):
        self._listeners = {}

    def _add_listener(self, name, callback):
        self._listeners.setdefault(name, []).append(callback)

    def _remove_listener(self, name, callback):
        self._listeners[name] = [item for item in self._listeners.get(name, []) if item != callback]

    def _notify(self, name):
        for callback in list(self._listeners.get(name, [])):
            callback()

    def __getattr__(self, item):
        if item.startswith("add_") and item.endswith("_listener"):
            name = item[4:-9]
            return lambda callback: self._add_listener(name, callback)
        if item.startswith("remove_") and item.endswith("_listener"):
            name = item[7:-9]
            return lambda callback: self._remove_listener(name, callback)
        raise AttributeError(item)


class FakeParameter(object):
    def __init__(self, name, value, minimum=0.0, maximum=1.0):
        self.name = name
        self._value = value
        self.min = minimum
        self.max = maximum
        self.display_value = str(value)

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, next_value):
        self._value = next_value
        self.display_value = str(next_value)


class FakeDevice(object):
    def __init__(self, name, parameters):
        self.name = name
        self.class_name = name
        self.parameters = parameters


class FakeBrowserItem(object):
    def __init__(self, name, uri, is_device=False, is_loadable=False, children=None, parameters=None):
        self.name = name
        self.uri = uri
        self.is_device = is_device
        self.is_loadable = is_loadable
        self.children = list(children or [])
        self.parameters = list(parameters or [FakeParameter("Macro 1", 0.5)])


class FakeBrowser(object):
    def __init__(self):
        self.instruments = FakeBrowserItem(
            "Instruments",
            "browser:instruments",
            children=[
                FakeBrowserItem("Operator", "browser:instruments:operator", is_device=True, is_loadable=True),
                FakeBrowserItem("Analog", "browser:instruments:analog", is_device=True, is_loadable=True),
            ],
        )
        self.sounds = FakeBrowserItem("Sounds", "browser:sounds", children=[])
        self.drums = FakeBrowserItem("Drums", "browser:drums", children=[])
        self.audio_effects = FakeBrowserItem(
            "Audio Effects",
            "browser:audio_effects",
            children=[FakeBrowserItem("EQ Eight", "browser:audio_effects:eq-eight", is_device=True, is_loadable=True)],
        )
        self.midi_effects = FakeBrowserItem(
            "MIDI Effects",
            "browser:midi_effects",
            children=[FakeBrowserItem("Arpeggiator", "browser:midi_effects:arpeggiator", is_device=True, is_loadable=True)],
        )
        self.loaded_items = []
        self.song = None

    def bind_song(self, song):
        self.song = song

    def load_item(self, item):
        self.loaded_items.append(item.uri)
        if self.song is None or getattr(self.song.view, "selected_track", None) is None:
            return

        track = self.song.view.selected_track
        track.devices.append(FakeDevice(item.name, [FakeParameter("Macro 1", 0.5)]))
        self.song._notify("tracks")


class FakeApplication(object):
    def __init__(self, browser=None):
        self.browser = browser or FakeBrowser()


class FakeClip(object):
    def __init__(self, name="Clip 1", length=4):
        self.name = name
        self.length = length
        self.is_playing = False
        self.notes = []
        self.last_add_new_notes_payload = None

    def add_new_notes(self, notes):
        self.last_add_new_notes_payload = notes
        if isinstance(notes, dict):
            self.notes.extend(notes.get("notes", []))
            return
        self.notes.extend(notes)

    def set_notes(self, notes):
        self.notes = list(notes)


class FakeClipSlot(object):
    def __init__(self):
        self.clip = None

    @property
    def has_clip(self):
        return self.clip is not None

    def create_clip(self, length):
        self.clip = FakeClip(length=length)

    def preview_clip(self, length_beats, name=None):
        preview = FakeClip(name=name or "Preview Clip", length=length_beats)
        return preview


class FakeTrack(object):
    def __init__(self, name):
        self.name = name
        self.type = "midi"
        self.arm = False
        self.mute = False
        self.solo = False
        self.clip_slots = [FakeClipSlot() for _ in range(4)]
        self.devices = [FakeDevice("Instrument", [FakeParameter("Macro 1", 0.5)])]


class FakeSongView(object):
    def __init__(self, song):
        self.song = song
        self.selected_track = song.tracks[0] if song.tracks else None


class FakeScene(object):
    def __init__(self, name):
        self.name = name


class FakeSong(ListenerMixin):
    def __init__(self):
        super(FakeSong, self).__init__()
        self.name = "Fake Set"
        self.live_version = "12.1.10"
        self.signature_numerator = 4
        self.signature_denominator = 4
        self._tempo = 124.0
        self._is_playing = False
        self.is_recording = False
        self.metronome = False
        self.tracks = [FakeTrack("Drums"), FakeTrack("Bass")]
        self.scenes = [FakeScene("Intro"), FakeScene("Drop")]
        self.view = FakeSongView(self)

    @property
    def tempo(self):
        return self._tempo

    @tempo.setter
    def tempo(self, next_value):
        self._tempo = next_value
        self._notify("tempo")

    @property
    def is_playing(self):
        return self._is_playing

    @is_playing.setter
    def is_playing(self, next_value):
        self._is_playing = bool(next_value)
        self._notify("is_playing")

    def start_playing(self):
        self.is_playing = True

    def stop_playing(self):
        self.is_playing = False

    def create_midi_track(self, index):
        self.tracks.insert(index, FakeTrack("Track {0}".format(index + 1)))
        self._notify("tracks")

    def create_scene(self, index):
        self.scenes.insert(index, FakeScene("Scene {0}".format(index + 1)))
        self._notify("scenes")

    def preview_track(self, index, name=None):
        track = FakeTrack(name or "Track {0}".format(index + 1))
        return track

    def preview_scene(self, index, name=None):
        return FakeScene(name or "Scene {0}".format(index + 1))


class FakeCInstance(object):
    def __init__(self, song=None):
        self._song = song or FakeSong()
        self._application = FakeApplication()
        self._application.browser.bind_song(self._song)
        self.scheduled = []
        self.logged = []
        self.messages = []

    def song(self):
        return self._song

    def application(self):
        return self._application

    def schedule_message(self, _delay, callback):
        self.scheduled.append(callback)
        callback()

    def log_message(self, message):
        self.logged.append(message)

    def show_message(self, message):
        self.messages.append(message)
