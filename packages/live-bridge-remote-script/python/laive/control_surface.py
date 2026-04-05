from __future__ import absolute_import, print_function, unicode_literals

import threading

try:
    from _Framework.ControlSurface import ControlSurface as AbletonControlSurface
except ImportError:  # pragma: no cover - exercised via fake harness tests
    class AbletonControlSurface(object):
        def __init__(self, c_instance):
            self._c_instance = c_instance

        def schedule_message(self, _delay, callback):
            callback()

        def log_message(self, _message):
            return None

        def show_message(self, _message):
            return None

        def song(self):
            return getattr(self._c_instance, "song", lambda: None)()

        def application(self):
            return getattr(self._c_instance, "application", lambda: None)()

        def disconnect(self):
            return None

from .listeners import ListenerHub
from .logging import StructuredFileLogger
from .live_access import LiveSetAdapter
from .protocol import PROTOCOL_VERSION, RequestError, make_error_response, make_response
from .server import RemoteCommandServer
from .task_queue import MainThreadTaskQueue


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7612


class LaiveControlSurface(AbletonControlSurface):
    def __init__(self, c_instance, host=DEFAULT_HOST, port=DEFAULT_PORT, auto_start_server=True):
        super(LaiveControlSurface, self).__init__(c_instance)
        self._main_thread_id = threading.get_ident()
        self._host = host
        self._port = port
        self._disposed = False
        self._structured_logger = StructuredFileLogger(
            "remote-script",
            filename="remote-script.jsonl",
            fallback=self.log_message,
        )
        self._task_queue = MainThreadTaskQueue(self._schedule_on_main_thread)
        self._live = LiveSetAdapter(self.song(), application=self.application())
        self._server = RemoteCommandServer(
            host=host,
            port=port,
            request_handler=self.process_request,
            logger=self._structured_logger,
        )
        self._listeners = ListenerHub(self._live, self.publish_event, logger=self._structured_logger)
        self._listeners.attach()

        if auto_start_server:
            self.start_server()

        self._structured_logger.info(
            "laive Remote Script initialized",
            event="remote_script.initialized",
            host=host,
            port=port,
            log_path=self._structured_logger.path,
        )
        self.show_message("laive: bridge ready on port {0}".format(self._port))

    def start_server(self):
        if self._disposed:
            raise RuntimeError("Cannot start server after disconnect")

        if not self._server.running:
            self._server.start()
            self._structured_logger.info(
                "remote command server started",
                event="remote_script.server_started",
                host=self._host,
                port=self._port,
            )
        return self._server.address

    def disconnect(self):
        self._disposed = True
        self._structured_logger.info("remote script disconnect requested", event="remote_script.disconnect")
        try:
            self._listeners.detach()
        finally:
            self._server.stop()
            super(LaiveControlSurface, self).disconnect()

    @property
    def live(self):
        return self._live

    @property
    def server(self):
        return self._server

    def publish_event(self, topic, payload):
        self._structured_logger.debug(
            "bridge event published",
            event="remote_script.event_published",
            topic=topic,
        )
        self._server.broadcast_event(topic, payload)

    def process_request(self, request):
        try:
            operation = request.get("operation")
            self._structured_logger.debug(
                "bridge request received",
                event="remote_script.request",
                operation=operation,
                target=request.get("target"),
                request_id=request.get("request_id"),
                dry_run=request.get("dry_run", False),
            )

            if operation == "hello":
                result = {
                    "bridge": "laive-remote-script",
                    "protocol_version": PROTOCOL_VERSION,
                    "live_version": self._live.live_version,
                }
            elif operation == "capabilities":
                result = self._live.capabilities()
            elif operation == "health":
                result = {
                    "status": "ok",
                    "server_running": self._server.running,
                    "client_count": self._server.client_count,
                    "task_queue_size": self._task_queue.pending_count,
                    "live_version": self._live.live_version,
                }
            elif operation == "get":
                result = self._handle_get(request.get("target"))
            elif operation == "set":
                result = self._handle_mutation(
                    self._handle_set,
                    request.get("target"),
                    request.get("arguments") or {},
                    request.get("dry_run", False),
                )
            elif operation == "call":
                result = self._handle_mutation(
                    self._handle_call,
                    request.get("target"),
                    request.get("arguments") or {},
                    request.get("dry_run", False),
                )
            else:
                raise RequestError("unsupported_operation", "Unsupported operation: {0}".format(operation))

            response = make_response(request.get("request_id"), ok=True, result=result, live_version=self._live.live_version)
            self._structured_logger.debug(
                "bridge request handled",
                event="remote_script.response",
                operation=operation,
                target=request.get("target"),
                request_id=request.get("request_id"),
                ok=True,
            )
            return response
        except RequestError as error:
            self._structured_logger.warn(
                "bridge request failed",
                event="remote_script.response",
                operation=request.get("operation"),
                target=request.get("target"),
                request_id=request.get("request_id"),
                ok=False,
                error=error,
            )
            return make_error_response(
                request.get("request_id"),
                error.code,
                str(error),
                live_version=self._live.live_version,
            )
        except Exception as error:  # pragma: no cover - safety path
            self._structured_logger.error(
                "bridge runtime error",
                event="remote_script.response",
                operation=request.get("operation"),
                target=request.get("target"),
                request_id=request.get("request_id"),
                ok=False,
                error=error,
            )
            return make_error_response(
                request.get("request_id"),
                "runtime_error",
                str(error),
                live_version=self._live.live_version,
            )

    def _handle_get(self, target):
        if target in (None, "song"):
            return self._live.get_song_state()
        if target == "arrangement":
            return self._live.get_arrangement_state()
        if target == "tracks":
            return self._live.get_tracks()
        if target == "return_tracks":
            return self._live.get_return_tracks()
        if target == "master_track":
            return self._live.get_master_track()
        if target == "scenes":
            return self._live.get_scenes()
        if target == "browser.tree":
            return self._live.get_browser_tree()
        if target == "browser.items":
            return self._live.get_browser_items()
        if target == "selection":
            return self._live.get_selection_state()
        if isinstance(target, str) and target.startswith("track:"):
            return self._live.get_track(target)
        if isinstance(target, str) and target.startswith("clip:"):
            return self._live.get_clip(target)
        if isinstance(target, str) and target.startswith("device:"):
            return self._live.get_device(target)
        if isinstance(target, str) and target.startswith("parameter:"):
            return self._live.get_parameter(target)
        raise RequestError("unknown_target", "Unknown get target: {0}".format(target))

    def _handle_set(self, target, arguments, dry_run):
        if target == "song.tempo":
            return self._live.set_tempo(arguments.get("value"), dry_run=dry_run)
        if target == "song.arrangement":
            return self._live.set_arrangement_state(
                current_song_time=arguments.get("current_song_time"),
                arrangement_position_beats=arguments.get("arrangement_position_beats"),
                loop_enabled=arguments.get("loop_enabled"),
                loop_start_beats=arguments.get("loop_start_beats"),
                loop_length_beats=arguments.get("loop_length_beats"),
                dry_run=dry_run,
            )
        if isinstance(target, str) and target.startswith("parameter:"):
            return self._live.set_parameter(target, arguments.get("value"), dry_run=dry_run)
        if target == "track.volume":
            return self._live.set_track_volume(
                arguments.get("track_id"),
                arguments.get("value"),
                dry_run=dry_run,
            )
        if target == "track.panning":
            return self._live.set_track_panning(
                arguments.get("track_id"),
                arguments.get("value"),
                dry_run=dry_run,
            )
        if target == "track.send":
            return self._live.set_send_level(
                arguments.get("track_id"),
                arguments.get("send_index"),
                arguments.get("value"),
                dry_run=dry_run,
            )
        if target == "track.volume":
            return self._live.set_track_volume(
                arguments.get("track_id"),
                arguments.get("value"),
                dry_run=dry_run,
            )
        if target == "track.panning":
            return self._live.set_track_panning(
                arguments.get("track_id"),
                arguments.get("value"),
                dry_run=dry_run,
            )
        if target == "track.monitoring_state":
            return self._live.set_monitor_state(
                arguments.get("track_id"),
                arguments.get("monitoring_state"),
                dry_run=dry_run,
            )
        if target == "track.routing":
            return self._live.set_track_routing(
                arguments.get("track_id"),
                input_routing_type=arguments.get("input_routing_type"),
                input_routing_channel=arguments.get("input_routing_channel"),
                output_routing_type=arguments.get("output_routing_type"),
                output_routing_channel=arguments.get("output_routing_channel"),
                dry_run=dry_run,
            )
        raise RequestError("unknown_target", "Unknown set target: {0}".format(target))

    def _handle_call(self, target, arguments, dry_run):
        if target == "transport.play":
            return self._live.play(dry_run=dry_run)
        if target == "transport.stop":
            return self._live.stop(dry_run=dry_run)
        if target == "create_track":
            return self._live.create_track(
                kind=arguments.get("type", "midi"),
                name=arguments.get("name"),
                dry_run=dry_run,
            )
        if target == "create_return_track":
            return self._live.create_return_track(
                name=arguments.get("name"),
                dry_run=dry_run,
            )
        if target == "create_scene":
            return self._live.create_scene(arguments.get("name"), dry_run=dry_run)
        if target == "create_return_track":
            return self._live.create_return_track(
                name=arguments.get("name"),
                dry_run=dry_run,
            )
        if target == "create_clip":
            return self._live.create_clip(
                track_id=arguments.get("track_id"),
                slot_index=arguments.get("slot_index"),
                length_beats=arguments.get("length_beats", 4),
                name=arguments.get("name"),
                dry_run=dry_run,
            )
        if target == "create_arrangement_clip":
            return self._live.create_arrangement_clip(
                track_id=arguments.get("track_id"),
                start_beats=arguments.get("start_beats"),
                length_beats=arguments.get("length_beats", 4),
                name=arguments.get("name"),
                dry_run=dry_run,
            )
        if target == "rename_clip":
            return self._live.rename_clip(
                clip_id=arguments.get("clip_id"),
                name=arguments.get("name"),
                dry_run=dry_run,
            )
        if target == "duplicate_clip":
            return self._live.duplicate_clip(
                clip_id=arguments.get("clip_id"),
                target_slot_index=arguments.get("target_slot_index"),
                target_track_id=arguments.get("target_track_id"),
                dry_run=dry_run,
            )
        if target == "move_session_clip":
            return self._live.move_session_clip(
                clip_id=arguments.get("clip_id"),
                target_slot_index=arguments.get("target_slot_index"),
                target_track_id=arguments.get("target_track_id"),
                dry_run=dry_run,
            )
        if target == "duplicate_clip_to_arrangement":
            return self._live.duplicate_clip_to_arrangement(
                clip_id=arguments.get("clip_id"),
                destination_beats=arguments.get("destination_beats"),
                target_track_id=arguments.get("target_track_id"),
                dry_run=dry_run,
            )
        if target == "duplicate_arrangement_clip":
            return self._live.duplicate_arrangement_clip(
                clip_id=arguments.get("clip_id"),
                destination_beats=arguments.get("destination_beats"),
                target_track_id=arguments.get("target_track_id"),
                dry_run=dry_run,
            )
        if target == "move_arrangement_clip":
            return self._live.move_arrangement_clip(
                clip_id=arguments.get("clip_id"),
                destination_beats=arguments.get("destination_beats"),
                dry_run=dry_run,
            )
        if target == "set_arrangement_clip_bounds":
            return self._live.set_arrangement_clip_bounds(
                clip_id=arguments.get("clip_id"),
                start_beats=arguments.get("start_beats"),
                end_beats=arguments.get("end_beats"),
                dry_run=dry_run,
            )
        if target == "split_arrangement_clip":
            return self._live.split_arrangement_clip(
                clip_id=arguments.get("clip_id"),
                split_beats=arguments.get("split_beats"),
                dry_run=dry_run,
            )
        if target == "delete_clip":
            return self._live.delete_clip(
                clip_id=arguments.get("clip_id"),
                dry_run=dry_run,
            )
        if target == "set_clip_loop_or_length":
            return self._live.set_clip_loop_or_length(
                clip_id=arguments.get("clip_id"),
                length_beats=arguments.get("length_beats"),
                loop_start_beats=arguments.get("loop_start_beats"),
                loop_end_beats=arguments.get("loop_end_beats"),
                looping=arguments.get("looping"),
                dry_run=dry_run,
            )
        if target == "insert_notes":
            return self._live.insert_notes(
                clip_id=arguments.get("clip_id"),
                notes=arguments.get("notes") or [],
                dry_run=dry_run,
            )
        if target == "replace_notes":
            return self._live.replace_notes(
                clip_id=arguments.get("clip_id"),
                notes=arguments.get("notes") or [],
                dry_run=dry_run,
            )
        if target == "launch_clip":
            return self._live.launch_clip(
                clip_id=arguments.get("clip_id"),
                dry_run=dry_run,
            )
        if target == "launch_scene":
            return self._live.launch_scene(
                scene_id=arguments.get("scene_id"),
                dry_run=dry_run,
            )
        if target == "stop_track_clips":
            return self._live.stop_track_clips(
                track_id=arguments.get("track_id"),
                dry_run=dry_run,
            )
        if target == "stop_all_clips":
            return self._live.stop_all_clips(dry_run=dry_run)
        if target == "get_browser_items":
            return self._live.get_browser_items(arguments.get("path"))
        if target == "load_browser_item":
            return self._live.load_browser_item(
                track_id=arguments.get("track_id"),
                uri=arguments.get("uri"),
                path=arguments.get("path"),
                dry_run=dry_run,
            )
        if target == "select_track":
            return self._live.select_track(
                track_id=arguments.get("track_id"),
                dry_run=dry_run,
            )
        if target == "select_clip":
            return self._live.select_clip(
                clip_id=arguments.get("clip_id"),
                dry_run=dry_run,
            )
        if target == "get_clip_notes":
            return self._live.get_clip_notes(arguments.get("clip_id"))
        raise RequestError("unknown_target", "Unknown call target: {0}".format(target))

    def _handle_mutation(self, handler, target, arguments, dry_run):
        return self._task_queue.submit(handler, target, arguments, dry_run)

    def _schedule_on_main_thread(self):
        try:
            self.schedule_message(0, self._drain_main_thread_tasks)
        except Exception:
            self._drain_main_thread_tasks()

    def _drain_main_thread_tasks(self):
        self._task_queue.drain()
