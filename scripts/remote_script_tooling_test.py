#!/usr/bin/env python3

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from remote_script_tooling import (
    detect_live_installs,
    doctor_report,
    install_remote_script,
    stage_remote_script,
)


class RemoteScriptToolingTests(unittest.TestCase):
    def test_detect_live_installs_from_custom_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            app_path = root / "Ableton Live 12 Suite.app"
            remote_scripts_dir = app_path / "Contents" / "App-Resources" / "MIDI Remote Scripts"
            remote_scripts_dir.mkdir(parents=True)

            installs = detect_live_installs([root])

            self.assertEqual(len(installs), 1)
            self.assertEqual(installs[0].app_path, app_path)
            self.assertEqual(installs[0].remote_scripts_dir, remote_scripts_dir)

    def test_stage_remote_script_creates_archive(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            payload = stage_remote_script(artifacts_dir=Path(temp_dir))
            self.assertTrue(Path(payload["staging_dir"]).exists())
            self.assertTrue(Path(payload["archive_path"]).exists())

    def test_install_remote_script_dry_run_reports_target(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            app_path = Path(temp_dir) / "Ableton Live 11 Suite.app"
            remote_scripts_dir = app_path / "Contents" / "App-Resources" / "MIDI Remote Scripts"
            remote_scripts_dir.mkdir(parents=True)

            payload = install_remote_script(app_path, dry_run=True)

            self.assertEqual(payload["status"], "dry_run")
            self.assertEqual(payload["remote_scripts_dir_exists"], True)
            self.assertTrue(payload["target_dir"].endswith("laive"))

    def test_install_remote_script_auto_detects_single_install(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            app_path = root / "Ableton Live 12 Suite.app"
            remote_scripts_dir = app_path / "Contents" / "App-Resources" / "MIDI Remote Scripts"
            remote_scripts_dir.mkdir(parents=True)

            original_candidate_roots = detect_live_installs.__globals__["candidate_live_search_roots"]
            detect_live_installs.__globals__["candidate_live_search_roots"] = lambda: [root]
            try:
                payload = install_remote_script(None, dry_run=True)
            finally:
                detect_live_installs.__globals__["candidate_live_search_roots"] = original_candidate_roots

            self.assertEqual(payload["status"], "dry_run")
            self.assertEqual(payload["live_app_path"], str(app_path))

    def test_doctor_report_contains_core_fields(self):
        payload = doctor_report()

        self.assertIn("cli_entrypoint_exists", payload)
        self.assertIn("remote_script_source_exists", payload)
        self.assertIn("detected_live_installs", payload)


if __name__ == "__main__":
    unittest.main()
