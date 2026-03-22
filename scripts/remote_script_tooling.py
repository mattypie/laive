#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


REPO_ROOT = Path(__file__).resolve().parents[1]
REMOTE_SCRIPT_SOURCE = (
    REPO_ROOT / "packages" / "live-bridge-remote-script" / "python" / "laive"
)
DEFAULT_ARTIFACTS_DIR = REPO_ROOT / "artifacts" / "remote-script"


@dataclass(frozen=True)
class LiveInstall:
    app_path: Path
    remote_scripts_dir: Path

    def to_dict(self) -> dict:
        return {
            "app_path": str(self.app_path),
            "remote_scripts_dir": str(self.remote_scripts_dir),
        }


def candidate_live_search_roots() -> List[Path]:
    return [Path("/Applications"), Path.home() / "Applications"]


def remote_scripts_dir_for_app(app_path: Path) -> Path:
    return app_path / "Contents" / "App-Resources" / "MIDI Remote Scripts"


def detect_live_installs(search_roots: Iterable[Path] | None = None) -> List[LiveInstall]:
    installs = []
    for root in search_roots or candidate_live_search_roots():
        if not root.exists():
            continue
        for app_path in sorted(root.glob("Ableton Live*.app")):
            remote_scripts_dir = remote_scripts_dir_for_app(app_path)
            installs.append(
                LiveInstall(app_path=app_path, remote_scripts_dir=remote_scripts_dir)
            )
    return installs


def ensure_source_exists(source_root: Path = REMOTE_SCRIPT_SOURCE) -> Path:
    if not source_root.exists():
        raise FileNotFoundError("Remote Script source not found: {0}".format(source_root))
    return source_root


def remove_tree(path: Path, attempts: int = 3, delay_seconds: float = 0.05) -> None:
    last_error = None
    for _attempt in range(attempts):
        try:
            shutil.rmtree(path)
            return
        except FileNotFoundError:
            return
        except OSError as error:
            last_error = error
            time.sleep(delay_seconds)
    if last_error is not None:
        raise last_error


def stage_remote_script(
    source_root: Path = REMOTE_SCRIPT_SOURCE,
    artifacts_dir: Path = DEFAULT_ARTIFACTS_DIR,
    archive_name: str = "laive-remote-script",
) -> dict:
    source_root = ensure_source_exists(source_root)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    staging_root = artifacts_dir / "staging"
    target_dir = staging_root / source_root.name

    if target_dir.exists():
        remove_tree(target_dir)

    shutil.copytree(source_root, target_dir)
    archive_path = shutil.make_archive(
        str(artifacts_dir / archive_name), "zip", root_dir=staging_root, base_dir=source_root.name
    )

    return {
        "source_root": str(source_root),
        "staging_dir": str(target_dir),
        "archive_path": archive_path,
    }


def choose_live_install(
    live_app_path: Path | None = None, search_roots: Iterable[Path] | None = None
) -> LiveInstall:
    if live_app_path is not None:
        return LiveInstall(
            app_path=live_app_path,
            remote_scripts_dir=remote_scripts_dir_for_app(live_app_path),
        )

    installs = detect_live_installs(search_roots)
    if not installs:
        raise FileNotFoundError(
            "No Ableton Live installs were detected. Pass --live-app to choose a bundle explicitly."
        )
    if len(installs) > 1:
        raise RuntimeError(
            "Multiple Live installs were detected. Pass --live-app to choose one explicitly."
        )
    return installs[0]


def doctor_report(search_roots: Iterable[Path] | None = None) -> dict:
    installs = detect_live_installs(search_roots)
    remote_script_source_exists = REMOTE_SCRIPT_SOURCE.exists()
    archive_path = DEFAULT_ARTIFACTS_DIR / "laive-remote-script.zip"
    package_json = REPO_ROOT / "package.json"
    bin_script = REPO_ROOT / "bin" / "laive.mjs"

    return {
        "repo_root": str(REPO_ROOT),
        "python_executable": sys.executable,
        "python_version": sys.version.split()[0],
        "remote_script_source": str(REMOTE_SCRIPT_SOURCE),
        "remote_script_source_exists": remote_script_source_exists,
        "cli_entrypoint": str(bin_script),
        "cli_entrypoint_exists": bin_script.exists(),
        "package_json_exists": package_json.exists(),
        "packaged_archive": str(archive_path),
        "packaged_archive_exists": archive_path.exists(),
        "detected_live_installs": [install.to_dict() for install in installs],
        "ready_for_install": remote_script_source_exists and len(installs) >= 1,
    }


def install_remote_script(
    live_app_path: Path | None = None,
    source_root: Path = REMOTE_SCRIPT_SOURCE,
    dry_run: bool = True,
    overwrite: bool = False,
    auto_package: bool = True,
) -> dict:
    source_root = ensure_source_exists(source_root)
    chosen_install = choose_live_install(live_app_path)
    live_app_path = chosen_install.app_path
    remote_scripts_dir = chosen_install.remote_scripts_dir
    target_dir = remote_scripts_dir / source_root.name
    package_payload = stage_remote_script(source_root=source_root) if auto_package else None

    payload = {
        "live_app_path": str(live_app_path),
        "remote_scripts_dir": str(remote_scripts_dir),
        "source_root": str(source_root),
        "target_dir": str(target_dir),
        "dry_run": dry_run,
        "overwrite": overwrite,
        "auto_packaged": auto_package,
        "package_payload": package_payload,
    }

    if dry_run:
        payload["status"] = "dry_run"
        payload["would_install"] = source_root.exists()
        payload["remote_scripts_dir_exists"] = remote_scripts_dir.exists()
        payload["target_exists"] = target_dir.exists()
        return payload

    remote_scripts_dir.mkdir(parents=True, exist_ok=True)
    if target_dir.exists():
        if not overwrite:
            raise FileExistsError(
                "Target Remote Script already exists: {0}. Use --overwrite to replace it.".format(
                    target_dir
                )
            )
        shutil.rmtree(target_dir)

    shutil.copytree(source_root, target_dir)
    payload["status"] = "installed"
    payload["target_exists"] = target_dir.exists()
    return payload


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Package and install the laive Remote Script.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    detect_parser = subparsers.add_parser("detect", help="Detect likely Ableton Live.app installs.")
    detect_parser.add_argument("--json", action="store_true", help="Emit JSON instead of plain text.")

    doctor_parser = subparsers.add_parser("doctor", help="Report whether the repo is ready to install.")
    doctor_parser.add_argument("--json", action="store_true", help="Emit JSON instead of plain text.")

    package_parser = subparsers.add_parser("package", help="Stage and zip the Remote Script.")
    package_parser.add_argument(
        "--artifacts-dir",
        default=str(DEFAULT_ARTIFACTS_DIR),
        help="Directory where staged files and zip archives are written.",
    )
    package_parser.add_argument("--json", action="store_true", help="Emit JSON instead of plain text.")

    install_parser = subparsers.add_parser("install", help="Install the Remote Script into a Live.app bundle.")
    install_parser.add_argument("--live-app", help="Path to Ableton Live.app")
    install_parser.add_argument("--apply", action="store_true", help="Perform the install instead of a dry run.")
    install_parser.add_argument("--overwrite", action="store_true", help="Overwrite an existing laive script.")
    install_parser.add_argument("--json", action="store_true", help="Emit JSON instead of plain text.")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "detect":
        installs = [install.to_dict() for install in detect_live_installs()]
        if args.json:
            print(json.dumps({"installs": installs}, indent=2))
        else:
            for install in installs:
                print("{app_path} -> {remote_scripts_dir}".format(**install))
        return 0

    if args.command == "doctor":
        payload = doctor_report()
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            for key, value in payload.items():
                print("{0}: {1}".format(key, value))
        return 0

    if args.command == "package":
        payload = stage_remote_script(artifacts_dir=Path(args.artifacts_dir))
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            for key, value in payload.items():
                print("{0}: {1}".format(key, value))
        return 0

    if args.command == "install":
        payload = install_remote_script(
            live_app_path=Path(args.live_app) if args.live_app else None,
            dry_run=not args.apply,
            overwrite=args.overwrite,
        )
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            for key, value in payload.items():
                print("{0}: {1}".format(key, value))
        return 0

    parser.error("Unknown command")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
