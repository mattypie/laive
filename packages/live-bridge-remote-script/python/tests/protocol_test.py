from __future__ import absolute_import, print_function, unicode_literals

import unittest

from laive.protocol import JsonLineParser, create_request, encode_json_line, make_event


class ProtocolTests(unittest.TestCase):
    def test_request_and_json_line_round_trip(self):
        request = create_request("get", target="song", request_id="req-1")
        parser = JsonLineParser()
        messages = parser.push(encode_json_line(request))

        self.assertEqual(messages[0]["operation"], "get")
        self.assertEqual(messages[0]["target"], "song")

    def test_event_shape(self):
        event = make_event("transport.changed", {"is_playing": True})
        self.assertEqual(event["topic"], "transport.changed")
        self.assertTrue(event["payload"]["is_playing"])


if __name__ == "__main__":
    unittest.main()
