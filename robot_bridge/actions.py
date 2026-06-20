from __future__ import annotations

from dataclasses import dataclass


OPS_BOT_ACTIONS = {
    "point_checkin",
    "point_lost_found",
    "point_charger",
    "point_demo_queue",
    "wave",
    "idle",
}


@dataclass(frozen=True)
class RobotCommand:
    name: str
    args: dict[str, float | int | str | bool]


ATTENTION_SCAN = (
    RobotCommand("stop", {}),
    RobotCommand("camera_default", {}),
    RobotCommand("wait", {"seconds": 0.15}),
    RobotCommand("camera_left", {}),
    RobotCommand("wait", {"seconds": 0.2}),
    RobotCommand("camera_right", {}),
    RobotCommand("wait", {"seconds": 0.2}),
    RobotCommand("camera_default", {}),
    RobotCommand("wait", {"seconds": 0.1}),
)


ACTION_COMMANDS: dict[str, tuple[RobotCommand, ...]] = {
    "point_checkin": ATTENTION_SCAN
    + (
        RobotCommand("move_forward", {"distance": 0.08}),
        RobotCommand("wait", {"seconds": 0.1}),
        RobotCommand("turn_left", {"angle": 0.22, "duration": 0.7}),
        RobotCommand("camera_left", {}),
        RobotCommand("camera_up", {}),
    ),
    "point_lost_found": ATTENTION_SCAN
    + (
        RobotCommand("move_forward", {"distance": 0.08}),
        RobotCommand("wait", {"seconds": 0.1}),
        RobotCommand("turn_right", {"angle": 0.22, "duration": 0.7}),
        RobotCommand("camera_right", {}),
        RobotCommand("camera_up", {}),
    ),
    "point_charger": ATTENTION_SCAN
    + (
        RobotCommand("move_forward", {"distance": 0.06}),
        RobotCommand("wait", {"seconds": 0.1}),
        RobotCommand("turn_left", {"angle": 0.3, "duration": 0.8}),
        RobotCommand("camera_left", {}),
        RobotCommand("camera_down", {}),
    ),
    "point_demo_queue": ATTENTION_SCAN
    + (
        RobotCommand("move_forward", {"distance": 0.06}),
        RobotCommand("wait", {"seconds": 0.1}),
        RobotCommand("turn_right", {"angle": 0.3, "duration": 0.8}),
        RobotCommand("camera_right", {}),
        RobotCommand("camera_down", {}),
    ),
    "wave": (
        RobotCommand("stop", {}),
        RobotCommand("camera_default", {}),
        RobotCommand("turn_left", {"angle": 0.18, "duration": 0.4}),
        RobotCommand("wait", {"seconds": 0.1}),
        RobotCommand("turn_right", {"angle": 0.36, "duration": 0.7}),
        RobotCommand("wait", {"seconds": 0.1}),
        RobotCommand("turn_left", {"angle": 0.18, "duration": 0.4}),
        RobotCommand("camera_default", {}),
    ),
    "idle": (
        RobotCommand("stop", {}),
    ),
}


def is_valid_action(action: object) -> bool:
    return isinstance(action, str) and action in OPS_BOT_ACTIONS


def map_robot_action(action: str) -> tuple[RobotCommand, ...]:
    if not is_valid_action(action):
        raise ValueError(f"Unsupported robot action: {action}")

    return ACTION_COMMANDS[action]
