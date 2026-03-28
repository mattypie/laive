from __future__ import absolute_import, print_function, unicode_literals

import json
import os
import tempfile
import unittest

from laive.logging import StructuredFileLogger


class StructuredFileLoggerTests(unittest.TestCase):
    def test_logger_writes_jsonl_entry(self):
        temp_dir = tempfile.mkdtemp()
        logger = StructuredFileLogger("remote-script-test", filename="remote-script.jsonl", log_dir=temp_dir)

        logger.info("remote_script.initialized", port=7612)

        with open(os.path.join(temp_dir, "remote-script.jsonl"), "r") as handle:
            entry = json.loads(handle.readline())

        self.assertEqual(entry["component"], "remote-script-test")
        self.assertEqual(entry["message"], "remote_script.initialized")
        self.assertEqual(entry["port"], 7612)
