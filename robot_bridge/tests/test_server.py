import unittest
from contextlib import redirect_stdout
from io import StringIO

from fastapi.testclient import TestClient

from robot_bridge.server import create_app


class RobotBridgeServerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dispatched_actions: list[str] = []
        self.client = TestClient(create_app(self.dispatched_actions.append))

    def test_post_action_accepts_and_dispatches(self) -> None:
        response = self.client.post("/action", json={"action": "point_demo_queue"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"ok": True, "action": "point_demo_queue", "robot_status": "sent"},
        )
        self.assertEqual(self.dispatched_actions, ["point_demo_queue"])

    def test_root_post_accepts_and_dispatches(self) -> None:
        response = self.client.post("/", json={"action": "point_lost_found"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["robot_status"], "sent")
        self.assertEqual(self.dispatched_actions, ["point_lost_found"])

    def test_unknown_action_returns_bad_request(self) -> None:
        response = self.client.post("/action", json={"action": "unknown"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Unsupported or missing action")
        self.assertEqual(self.dispatched_actions, [])

    def test_health_returns_ok(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})

    def test_dispatch_failure_returns_bad_gateway(self) -> None:
        def failing_dispatcher(action: str) -> None:
            raise RuntimeError("boom")

        client = TestClient(create_app(failing_dispatcher))
        with redirect_stdout(StringIO()):
            response = client.post("/action", json={"action": "point_demo_queue"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Robot action failed")


if __name__ == "__main__":
    unittest.main()
