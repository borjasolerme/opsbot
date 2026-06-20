import os
import unittest
from unittest.mock import patch

from robot_bridge.cyberwave_adapter import (
    DEFAULT_REGISTRY_ID,
    SCENE_POSITIONS_BY_ACTION,
    _get_environment_reference,
    _get_robot,
    _get_robot_mode,
    _should_free_roam,
    _should_update_scene_pose,
    _should_update_scene_rotation,
)


class CyberwaveAdapterTest(unittest.TestCase):
    def test_default_robot_asset_is_ugv_beast(self) -> None:
        self.assertEqual(DEFAULT_REGISTRY_ID, "waveshare/ugv-beast")

    def test_builds_environment_slug_from_workspace_and_environment_name(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CYBERWAVE_WORKSPACE": "borjas-workspace",
                "CYBERWAVE_ENVIRONMENT_ID": "opsbot-hackathon-demo",
            },
            clear=True,
        ):
            self.assertEqual(
                _get_environment_reference(),
                "borjas-workspace/envs/opsbot-hackathon-demo",
            )

    def test_keeps_full_environment_slug_unchanged(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CYBERWAVE_WORKSPACE": "borjas-workspace",
                "CYBERWAVE_ENVIRONMENT_ID": "borjas-workspace/envs/opsbot-hackathon-demo",
            },
            clear=True,
        ):
            self.assertEqual(
                _get_environment_reference(),
                "borjas-workspace/envs/opsbot-hackathon-demo",
            )

    def test_keeps_environment_uuid_unchanged(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CYBERWAVE_WORKSPACE": "borjas-workspace",
                "CYBERWAVE_ENVIRONMENT_ID": "075f2258-8e0f-4ce3-9e91-c00cb387cca8",
            },
            clear=True,
        ):
            self.assertEqual(
                _get_environment_reference(),
                "075f2258-8e0f-4ce3-9e91-c00cb387cca8",
            )

    def test_get_robot_uses_registry_twin_id_and_environment_uuid(self) -> None:
        class CyberwaveClient:
            def __init__(self) -> None:
                self.twin_call: tuple[tuple[object, ...], dict[str, object]] | None = None

            def twin(self, *args: object, **kwargs: object) -> object:
                self.twin_call = (args, kwargs)
                return object()

        client = CyberwaveClient()
        with patch.dict(
            os.environ,
            {
                "CYBERWAVE_ROBOT_REGISTRY_ID": "waveshare/ugv-beast",
                "CYBERWAVE_ROBOT_ID": "8599efec-fe5b-47ea-8040-78cd9e531d9a",
                "CYBERWAVE_ENVIRONMENT_ID": "075f2258-8e0f-4ce3-9e91-c00cb387cca8",
            },
            clear=True,
        ):
            _get_robot(client)

        self.assertEqual(
            client.twin_call,
            (
                ("waveshare/ugv-beast",),
                {
                    "twin_id": "8599efec-fe5b-47ea-8040-78cd9e531d9a",
                    "environment_id": "075f2258-8e0f-4ce3-9e91-c00cb387cca8",
                },
            ),
        )

    def test_scene_rotation_is_enabled_for_simulation_visibility(self) -> None:
        with patch.dict(os.environ, {"CYBERWAVE_SIMULATION_VISIBILITY_MODE": "scene_edit"}):
            self.assertTrue(
                _should_update_scene_rotation("simulation", "point_lost_found")
            )
            self.assertFalse(_should_update_scene_rotation("live", "point_lost_found"))

    def test_scene_pose_is_enabled_for_simulation_visibility(self) -> None:
        with patch.dict(os.environ, {"CYBERWAVE_SIMULATION_VISIBILITY_MODE": "scene_edit"}):
            self.assertTrue(_should_update_scene_pose("simulation", "point_demo_queue"))
            self.assertFalse(_should_update_scene_pose("live", "point_demo_queue"))

    def test_demo_scene_positions_cover_each_front_desk_area(self) -> None:
        self.assertEqual(
            SCENE_POSITIONS_BY_ACTION["point_checkin"],
            {"x": -2.0, "y": 1.4, "z": 0.0},
        )
        self.assertEqual(
            SCENE_POSITIONS_BY_ACTION["point_lost_found"],
            {"x": 2.0, "y": 1.4, "z": 0.0},
        )
        self.assertEqual(
            SCENE_POSITIONS_BY_ACTION["point_charger"],
            {"x": -2.0, "y": -1.4, "z": 0.0},
        )
        self.assertEqual(
            SCENE_POSITIONS_BY_ACTION["point_demo_queue"],
            {"x": 2.0, "y": -1.4, "z": 0.0},
        )
        self.assertEqual(
            SCENE_POSITIONS_BY_ACTION["look_around"],
            {"x": 0.0, "y": 0.0, "z": 0.0},
        )

    def test_robot_mode_prefers_robot_mode_env(self) -> None:
        with patch.dict(
            os.environ,
            {"ROBOT_MODE": "simulation", "CYBERWAVE_AFFECT": "live"},
            clear=True,
        ):
            self.assertEqual(_get_robot_mode(), "simulation")

    def test_robot_mode_supports_live(self) -> None:
        with patch.dict(os.environ, {"ROBOT_MODE": "live"}, clear=True):
            self.assertEqual(_get_robot_mode(), "live")

    def test_robot_mode_falls_back_to_cyberwave_affect(self) -> None:
        with patch.dict(os.environ, {"CYBERWAVE_AFFECT": "simulation"}, clear=True):
            self.assertEqual(_get_robot_mode(), "simulation")

    def test_free_roam_is_enabled_for_simulation_by_default(self) -> None:
        with patch.dict(os.environ, {"ROBOT_MODE": "simulation"}, clear=True):
            self.assertTrue(_should_free_roam())

    def test_free_roam_is_disabled_for_live_by_default(self) -> None:
        with patch.dict(os.environ, {"ROBOT_MODE": "live"}, clear=True):
            self.assertFalse(_should_free_roam())

    def test_free_roam_can_be_disabled(self) -> None:
        with patch.dict(
            os.environ,
            {"ROBOT_MODE": "simulation", "ROBOT_FREE_ROAM": "0"},
            clear=True,
        ):
            self.assertFalse(_should_free_roam())


if __name__ == "__main__":
    unittest.main()
