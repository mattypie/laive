from __future__ import absolute_import, print_function, unicode_literals

import unittest

from laive.fake_live import FakeSong
from laive.listeners import ListenerHub
from laive.live_access import LiveSetAdapter


class ListenerHubTests(unittest.TestCase):
    def test_song_listeners_emit_bridge_events(self):
        song = FakeSong()
        adapter = LiveSetAdapter(song)
        events = []
        listeners = ListenerHub(adapter, lambda topic, payload: events.append((topic, payload)))
        listeners.attach()

        song.tempo = 128
        song.create_scene(2)
        song.create_midi_track(2)

        listeners.detach()

        self.assertEqual(events[0][0], "transport.changed")
        self.assertEqual(events[0][1]["tempo"], 128)
        self.assertEqual(events[1][0], "state.changed")
        self.assertEqual(events[2][0], "tracks.changed")


if __name__ == "__main__":
    unittest.main()
