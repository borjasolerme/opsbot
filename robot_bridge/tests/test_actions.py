import unittest

from robot_bridge.actions import map_robot_action


class ActionMapperTest(unittest.TestCase):
    def test_maps_demo_queue_to_attentive_visible_turn(self) -> None:
        commands = map_robot_action("point_demo_queue")

        self.assertEqual(
            [command.name for command in commands],
            [
                "stop",
                "camera_default",
                "wait",
                "camera_left",
                "wait",
                "camera_right",
                "wait",
                "camera_default",
                "wait",
                "move_forward",
                "wait",
                "turn_right",
                "camera_right",
                "camera_down",
            ],
        )
        self.assertEqual(commands[9].args, {"distance": 0.06})
        self.assertEqual(commands[11].args, {"angle": 0.3, "duration": 0.8})

    def test_maps_each_quadrant_to_final_camera_direction(self) -> None:
        self.assertEqual(
            [command.name for command in map_robot_action("point_checkin")][-3:],
            ["turn_left", "camera_left", "camera_up"],
        )
        self.assertEqual(
            [command.name for command in map_robot_action("point_lost_found")][-3:],
            ["turn_right", "camera_right", "camera_up"],
        )
        self.assertEqual(
            [command.name for command in map_robot_action("point_charger")][-3:],
            ["turn_left", "camera_left", "camera_down"],
        )

    def test_maps_look_around_to_camera_scan_and_body_motion(self) -> None:
        command_names = [command.name for command in map_robot_action("look_around")]

        self.assertEqual(command_names[:9], [
            "stop",
            "camera_default",
            "wait",
            "camera_left",
            "wait",
            "camera_right",
            "wait",
            "camera_default",
            "wait",
        ])
        self.assertIn("turn_left", command_names)
        self.assertIn("turn_right", command_names)

    def test_rejects_unknown_action(self) -> None:
        with self.assertRaises(ValueError):
            map_robot_action("unknown")


if __name__ == "__main__":
    unittest.main()
