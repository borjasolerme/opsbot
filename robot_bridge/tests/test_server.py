import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from robot_bridge.server import create_handler


class RobotBridgeServerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dispatched_actions: list[str] = []
        handler = create_handler(self.dispatched_actions.append)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()
        self.host, self.port = self.server.server_address

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def test_post_action_dispatches_and_returns_ok(self) -> None:
        status, payload = self._post_json("/action", {"action": "point_demo_queue"})

        self.assertEqual(status, 200)
        self.assertEqual(payload, {"ok": True, "action": "point_demo_queue"})
        self.assertEqual(self.dispatched_actions, ["point_demo_queue"])

    def test_unknown_action_returns_bad_request(self) -> None:
        status, payload = self._post_json("/action", {"action": "unknown"})

        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "Unsupported or missing action")
        self.assertEqual(self.dispatched_actions, [])

    def _post_json(self, path: str, body: dict[str, object]) -> tuple[int, dict[str, object]]:
        connection = http.client.HTTPConnection(self.host, self.port, timeout=2)
        connection.request(
            "POST",
            path,
            body=json.dumps(body),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        payload = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, payload


if __name__ == "__main__":
    unittest.main()

