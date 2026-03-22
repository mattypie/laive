from __future__ import absolute_import, print_function, unicode_literals

import queue
import threading


class MainThreadTaskQueue(object):
    def __init__(self, scheduler):
        self._queue = queue.Queue()
        self._scheduler = scheduler
        self._main_thread_id = threading.get_ident()
        self._draining = False

    @property
    def pending_count(self):
        return self._queue.qsize()

    def submit(self, handler, *args):
        if threading.get_ident() == self._main_thread_id:
            return handler(*args)

        response_queue = queue.Queue(maxsize=1)
        self._queue.put((handler, args, response_queue))
        self._scheduler()
        success, payload = response_queue.get(timeout=5.0)
        if success:
            return payload
        raise payload

    def drain(self):
        if self._draining:
            return

        self._draining = True
        try:
            while True:
                try:
                    handler, args, response_queue = self._queue.get_nowait()
                except queue.Empty:
                    break

                try:
                    response_queue.put((True, handler(*args)))
                except Exception as error:  # pragma: no cover - exercised through submit
                    response_queue.put((False, error))
        finally:
            self._draining = False
