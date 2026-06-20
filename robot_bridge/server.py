from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

from .actions import is_valid_action


ActionDispatcher = Callable[[str], None]


def dispatch_robot_action(action: str) -> None:
    from .cyberwave_adapter import send_robot_action

    send_robot_action(action)


def create_handler(dispatcher: ActionDispatcher = dispatch_robot_action):
    class RobotBridgeHandler(BaseHTTPRequestHandler):
        server_version = "OpsBotRobotBridge/0.1"

        def do_GET(self) -> None:
            if self.path == "/health":
                self._send_json(HTTPStatus.OK, {"ok": True})
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

        def do_POST(self) -> None:
            if self.path not in {"/", "/action"}:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
                return

            payload = self._read_json()
            if payload is None:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            action = payload.get("action")
            if not is_valid_action(action):
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"error": "Unsupported or missing action"},
                )
                return

            try:
                dispatcher(action)
            except Exception as exc:
                self._send_json(
                    HTTPStatus.BAD_GATEWAY,
                    {"ok": False, "action": action, "error": str(exc)},
                )
                return

            self._send_json(HTTPStatus.OK, {"ok": True, "action": action})

        def log_message(self, format: str, *args: object) -> None:
            if os.getenv("ROBOT_BRIDGE_LOG_REQUESTS") == "1":
                super().log_message(format, *args)

        def _read_json(self) -> dict[str, object] | None:
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length)

            try:
                payload = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                return None

            return payload if isinstance(payload, dict) else None

        def _send_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return RobotBridgeHandler


def run_server(
    host: str | None = None,
    port: int | None = None,
    dispatcher: ActionDispatcher = dispatch_robot_action,
) -> ThreadingHTTPServer:
    server_host = host or os.getenv("ROBOT_BRIDGE_HOST", "127.0.0.1")
    server_port = port or int(os.getenv("ROBOT_BRIDGE_PORT", "8765"))
    server = ThreadingHTTPServer((server_host, server_port), create_handler(dispatcher))
    print(f"OpsBot robot bridge listening on http://{server_host}:{server_port}")
    server.serve_forever()
    return server


if __name__ == "__main__":
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nOpsBot robot bridge stopped")
