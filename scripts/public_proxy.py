#!/usr/bin/env python3

from __future__ import annotations

import http.client
import os
import select
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from socket import timeout as SocketTimeout
from urllib.parse import urlsplit


HOST = "127.0.0.1"
PORT = 9511
WORKER_PORT = os.environ.get("LIVE_WORKER_PORT", "8788")
API_BASE = f"http://127.0.0.1:{WORKER_PORT}"
DIST_DIR = str(Path(__file__).resolve().parents[1] / "ui" / "dist")


class PublicProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self._proxy_request()
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy_request()
            return

        path = self.translate_path(self.path.split("?", 1)[0].split("#", 1)[0])
        if os.path.exists(path) and not os.path.isdir(path):
            super().do_GET()
            return

        self.path = "/index.html"
        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith("/api/"):
            self._proxy_request()
            return
        super().do_HEAD()

    def do_POST(self):
        self._proxy_request()

    def do_PUT(self):
        self._proxy_request()

    def do_DELETE(self):
        self._proxy_request()

    def _proxy_request(self):
        try:
            target = urlsplit(API_BASE)
            connection = http.client.HTTPConnection(target.hostname, target.port, timeout=10)

            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length) if content_length else None

            headers = {key: value for key, value in self.headers.items()}
            headers["Host"] = target.netloc
            headers["X-Forwarded-Proto"] = "https"
            headers["X-Forwarded-Host"] = self.headers.get("Host", "strudel.ussyco.de")

            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()

            self.send_response(response.status)
            is_sse = response.getheader("Content-Type", "").startswith("text/event-stream")
            for key, value in response.getheaders():
                if key.lower() in {"transfer-encoding", "connection", "keep-alive"}:
                    continue
                self.send_header(key, value)
            if is_sse:
                self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            if self.command == "HEAD":
                return

            if is_sse:
                self.close_connection = False
                while True:
                    ready, _, _ = select.select([response.fp], [], [], 15)
                    if not ready:
                        self.wfile.write(b": proxy-keepalive\n\n")
                        self.wfile.flush()
                        continue

                    chunk = response.fp.read1(4096)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
                return

            payload = response.read()
            self.wfile.write(payload)
        except (ConnectionRefusedError, http.client.HTTPException, OSError, SocketTimeout):
            payload = b'{"error":"upstream unavailable"}'
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()

            if self.command != "HEAD":
                self.wfile.write(payload)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), PublicProxyHandler)
    print(f"Public proxy serving on http://{HOST}:{PORT}")
    server.serve_forever()
