from __future__ import annotations

import os
import math
import time
from typing import Any

from .actions import RobotCommand, map_robot_action


DEFAULT_REGISTRY_ID = "waveshare/ugv-beast"
SCENE_YAWS_BY_ACTION = {
    "point_checkin": -18.0,
    "point_lost_found": 18.0,
    "point_charger": -30.0,
    "point_demo_queue": 30.0,
    "idle": 0.0,
}
_LAST_SCENE_YAW: float | None = None


def send_robot_action(action: str) -> None:
    from cyberwave import Cyberwave

    client = Cyberwave()
    mode = _get_robot_mode()
    _log_bridge(f"Robot mode: {mode}")
    client.affect(mode)

    robot = _get_robot(client)
    _log_bridge(
        "Cyberwave target: "
        f"mode={mode} "
        f"environment={getattr(robot, 'environment_id', None)} "
        f"asset={getattr(robot, 'asset_id', None)} "
        f"twin_uuid={getattr(robot, 'uuid', None)} "
        f"twin_slug={getattr(robot, 'slug', None)}"
    )

    for command in map_robot_action(action):
        _log_bridge(f"Cyberwave command: action={action} command={command.name} args={command.args}")
        _execute_command(robot, command)

    if _should_update_scene_rotation(mode, action):
        yaw = SCENE_YAWS_BY_ACTION[action]
        _log_bridge(f"Cyberwave scene edit: action={action} smooth_edit_rotation yaw={yaw}")
        _smooth_scene_rotation(robot, yaw)

    _log_bridge(f"Action sent: {action}")


def _get_robot(client: Any) -> Any:
    twin_id = os.getenv("CYBERWAVE_ROBOT_ID")
    if twin_id:
        return client.twin(twin_id=twin_id)

    registry_id = os.getenv("CYBERWAVE_ROBOT_REGISTRY_ID", DEFAULT_REGISTRY_ID)
    environment_id = _get_environment_reference()
    if environment_id:
        return client.twin(registry_id, environment_id=environment_id)

    return client.twin(registry_id)


def _get_environment_reference() -> str | None:
    environment_id = os.getenv("CYBERWAVE_ENVIRONMENT_ID")
    if not environment_id:
        return None

    workspace = os.getenv("CYBERWAVE_WORKSPACE")
    if workspace and "/" not in environment_id:
        return f"{workspace}/envs/{environment_id}"

    return environment_id


def _get_robot_mode() -> str:
    mode = os.getenv("ROBOT_MODE") or os.getenv("CYBERWAVE_AFFECT", "live")
    normalized_mode = mode.strip().lower()

    if normalized_mode == "real-world":
        return "live"

    if normalized_mode in {"simulation", "live"}:
        return normalized_mode

    _log_bridge(f"Unsupported ROBOT_MODE={mode!r}; falling back to simulation")
    return "simulation"


def _log_bridge(message: str) -> None:
    print(message, flush=True)

    log_path = os.getenv("ROBOT_BRIDGE_LOG_FILE")
    if not log_path:
        return

    with open(log_path, "a", encoding="utf-8") as log_file:
        log_file.write(f"{message}\n")


def _execute_command(robot: Any, command: RobotCommand) -> None:
    if command.name == "wait":
        time.sleep(float(command.args.get("seconds", 0.1)))
        return

    if command.name == "stop":
        _stop_robot(robot)
        return

    method = getattr(robot, command.name, None)
    if callable(method):
        method(**command.args)
        return

    commands = getattr(robot, "commands", None)
    dynamic_method = getattr(commands, command.name, None) if commands else None
    if callable(dynamic_method):
        dynamic_method(**command.args)
        return

    if command.name == "wave":
        _fallback_wave(robot)
        return

    raise RuntimeError(f"Cyberwave robot does not support command: {command.name}")


def _should_update_scene_rotation(mode: str, action: str) -> bool:
    visibility_mode = os.getenv("CYBERWAVE_SIMULATION_VISIBILITY_MODE", "scene_edit")
    return mode == "simulation" and visibility_mode == "scene_edit" and action in SCENE_YAWS_BY_ACTION


def _smooth_scene_rotation(robot: Any, target_yaw: float) -> None:
    global _LAST_SCENE_YAW

    start_yaw = _get_current_yaw(robot)
    if start_yaw is None:
        start_yaw = _LAST_SCENE_YAW if _LAST_SCENE_YAW is not None else 0.0

    delta = _shortest_angle_delta(start_yaw, target_yaw)
    steps = max(1, int(os.getenv("CYBERWAVE_SCENE_ROTATION_STEPS", "6")))
    delay = float(os.getenv("CYBERWAVE_SCENE_ROTATION_STEP_DELAY", "0.04"))

    for step in range(1, steps + 1):
        eased = _ease_in_out(step / steps)
        yaw = start_yaw + delta * eased
        robot.edit_rotation(yaw=yaw)
        if step < steps:
            time.sleep(delay)

    _LAST_SCENE_YAW = target_yaw


def _get_current_yaw(robot: Any) -> float | None:
    get_rotation = getattr(robot, "_get_current_rotation", None)
    if not callable(get_rotation):
        return None

    try:
        rotation = get_rotation()
    except Exception:
        return None

    try:
        w = float(rotation["w"])
        x = float(rotation["x"])
        y = float(rotation["y"])
        z = float(rotation["z"])
    except (KeyError, TypeError, ValueError):
        return None

    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    return math.degrees(math.atan2(siny_cosp, cosy_cosp))


def _shortest_angle_delta(start: float, target: float) -> float:
    return (target - start + 180.0) % 360.0 - 180.0


def _ease_in_out(progress: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * progress)


def _stop_robot(robot: Any) -> None:
    stop_method = getattr(robot, "stop", None)
    if callable(stop_method):
        stop_method()
        return

    commands = getattr(robot, "commands", None)
    dynamic_stop = getattr(commands, "stop", None) if commands else None
    if callable(dynamic_stop):
        dynamic_stop()
        return

    move_forward = getattr(robot, "move_forward", None)
    if callable(move_forward):
        move_forward(distance=0.0)
        return

    raise RuntimeError("Cyberwave robot does not support a stop command")


def _fallback_wave(robot: Any) -> None:
    stand_up = getattr(robot, "stand_up", None)
    if callable(stand_up):
        stand_up()
        return

    commands = getattr(robot, "commands", None)
    led_toggle = getattr(commands, "led_toggle", None) if commands else None
    if callable(led_toggle):
        led_toggle()
        return

    raise RuntimeError("Cyberwave robot does not support wave or a fallback gesture")
