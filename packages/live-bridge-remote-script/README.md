# `@laive/live-bridge-remote-script`

This package contains two implementation layers:

- the JavaScript fixture bridge and test harness used for repository development
- a first-pass Python Ableton Remote Script scaffold under `python/laive`

## Python Remote Script Layout

The Python package is intended to be copied into Ableton Live's `MIDI Remote Scripts` directory as a folder named `laive`.

Key Python modules:

- `__init__.py`
- `control_surface.py`
- `protocol.py`
- `server.py`
- `task_queue.py`
- `listeners.py`
- `live_access.py`

The scaffold is dependency-light and includes `unittest` coverage with a fake Live object model under `python/tests`.
