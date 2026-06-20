from __future__ import annotations

import math
import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

from .actions import RobotCommand, map_robot_action


DEFAULT_REGISTRY_ID = "waveshare/ugv-beast"
FREE_ROAM_X_BOUNDS = (-2.2, 2.2)
FREE_ROAM_Y_BOUNDS = (-1.5, 1.5)
SCENE_YAWS_BY_ACTION = {
    "point_checkin": -18.0,
    "point_lost_found": 18.0,
    "point_charger": -30.0,
    "point_demo_queue": 30.0,
    "look_around": 0.0,
    "idle": 0.0,
}
SCENE_POSITIONS_BY_ACTION = {
    "point_checkin": {"x": -2.0, "y": 1.4, "z": 0.0},
    "point_lost_found": {"x": 2.0, "y": 1.4, "z": 0.0},
    "point_charger": {"x": -2.0, "y": -1.4, "z": 0.0},
    "point_demo_queue": {"x": 2.0, "y": -1.4, "z": 0.0},
    "look_around": {"x": 0.0, "y": 0.0, "z": 0.0},
    "idle": {"x": 0.0, "y": 0.0, "z": 0.0},
}
WAYPOINT_IDS_BY_ACTION = {
    "point_checkin": "opsbot_checkin",
    "point_lost_found": "opsbot_lost_found",
    "point_charger": "opsbot_charger",
    "point_demo_queue": "opsbot_demo_queue",
    "look_around": "opsbot_center",
}
WORKFLOW_ENV_KEYS_BY_ACTION = {
    "point_checkin": "CYBERWAVE_WORKFLOW_POINT_CHECKIN",
    "point_lost_found": "CYBERWAVE_WORKFLOW_POINT_LOST_FOUND",
    "point_charger": "CYBERWAVE_WORKFLOW_POINT_CHARGER",
    "point_demo_queue": "CYBERWAVE_WORKFLOW_POINT_DEMO_QUEUE",
    "look_around": "CYBERWAVE_WORKFLOW_LOOK_AROUND",
}
WORKFLOW_TRIGGER_ENV_KEYS_BY_ACTION = {
    "point_checkin": "CYBERWAVE_WORKFLOW_TRIGGER_POINT_CHECKIN",
    "point_lost_found": "CYBERWAVE_WORKFLOW_TRIGGER_POINT_LOST_FOUND",
    "point_charger": "CYBERWAVE_WORKFLOW_TRIGGER_POINT_CHARGER",
    "point_demo_queue": "CYBERWAVE_WORKFLOW_TRIGGER_POINT_DEMO_QUEUE",
    "look_around": "CYBERWAVE_WORKFLOW_TRIGGER_LOOK_AROUND",
}
CAMERA_JOINT_POSITIONS_BY_COMMAND = {
    "camera_default": {
        "pt_base_link_to_pt_link1": 0.0,
        "pt_link1_to_pt_link2": 0.0,
    },
    "camera_left": {
        "pt_base_link_to_pt_link1": 0.45,
    },
    "camera_right": {
        "pt_base_link_to_pt_link1": -0.45,
    },
    "camera_up": {
        "pt_link1_to_pt_link2": -0.32,
    },
    "camera_down": {
        "pt_link1_to_pt_link2": 0.32,
    },
}
_LAST_SCENE_YAW: float | None = None
_LAST_CAMERA_JOINTS = {
    "pt_base_link_to_pt_link1": 0.0,
    "pt_link1_to_pt_link2": 0.0,
}


def send_robot_action(action: str, *, wait_for_motion: bool = True) -> None:
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

    _trigger_workflow_if_configured(client, action)

    sent_initial_command = False
    update_scene_pose = _should_update_scene_pose(mode, action)
    if update_scene_pose and wait_for_motion:
        _apply_scene_demo_pose(robot, action)
        sent_initial_command = True
    elif update_scene_pose:
        _apply_scene_position(robot, action)
        sent_initial_command = True

    commands = map_robot_action(action)
    if wait_for_motion:
        _execute_commands(robot, action, commands)
        _execute_free_roam(robot, action)
    else:
        if update_scene_pose:
            _run_scene_rotation_background(robot, action)

        background_commands = commands
        if not sent_initial_command and commands:
            first_command = commands[0]
            _log_bridge(
                f"Cyberwave command: action={action} "
                f"command={first_command.name} args={first_command.args}"
            )
            _execute_command(robot, first_command)
            background_commands = commands[1:]

        _run_commands_background(robot, action, background_commands)

    _log_bridge(f"Action sent: {action}")


def _get_robot(client: Any) -> Any:
    registry_id = os.getenv("CYBERWAVE_ROBOT_REGISTRY_ID", DEFAULT_REGISTRY_ID)
    environment_id = _get_environment_reference()
    twin_id = os.getenv("CYBERWAVE_ROBOT_ID", "").strip()
    if twin_id:
        if environment_id:
            return client.twin(registry_id, twin_id=twin_id, environment_id=environment_id)

        return client.twin(registry_id, twin_id=twin_id)

    if environment_id:
        return client.twin(registry_id, environment_id=environment_id)

    return client.twin(registry_id)


def _get_environment_reference() -> str | None:
    environment_id = os.getenv("CYBERWAVE_ENVIRONMENT_ID", "").strip()
    if not environment_id:
        return None

    if _is_uuid(environment_id):
        return environment_id

    workspace = os.getenv("CYBERWAVE_WORKSPACE")
    if workspace and "/" not in environment_id:
        return f"{workspace}/envs/{environment_id}"

    return environment_id


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False

    return True


def _get_robot_mode() -> str:
    mode = os.getenv("ROBOT_MODE") or os.getenv("CYBERWAVE_AFFECT", "live")
    normalized_mode = mode.strip().lower()

    if normalized_mode == "real-world":
        return "live"

    if normalized_mode in {"simulation", "live"}:
        return normalized_mode

    _log_bridge(f"Unsupported ROBOT_MODE={mode!r}; falling back to simulation")
    return "simulation"


def _trigger_workflow_if_configured(client: Any, action: str) -> None:
    workflow_id = _workflow_id_for_action(action)
    trigger_node_uuid = _workflow_trigger_node_for_action(action)
    if not workflow_id or not trigger_node_uuid:
        return

    api_key = os.getenv("CYBERWAVE_API_KEY") or getattr(getattr(client, "config", None), "api_key", None)
    base_url = getattr(getattr(client, "config", None), "base_url", "https://api.cyberwave.com")
    if not api_key:
        _log_bridge("Cyberwave workflow skipped: CYBERWAVE_API_KEY is missing")
        return

    inputs = {
        "twin_uuid": os.getenv("CYBERWAVE_ROBOT_ID", "").strip(),
        "waypoint_id": WAYPOINT_IDS_BY_ACTION.get(action),
    }
    body = {
        "trigger_node_uuid": trigger_node_uuid,
        "inputs": {key: value for key, value in inputs.items() if value},
    }
    url = f"{base_url.rstrip('/')}/api/v1/workflows/{workflow_id}/trigger"
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            data = json.loads(response.read().decode("utf-8") or "{}")
        _log_bridge(
            "Cyberwave workflow triggered: "
            f"action={action} workflow={workflow_id} run={data.get('uuid') or data.get('id')}"
        )
    except Exception as exc:
        if isinstance(exc, urllib.error.HTTPError):
            detail = exc.read().decode("utf-8", errors="replace")
            _log_bridge(
                "Cyberwave workflow trigger failed: "
                f"action={action} status={exc.code} body={detail[:300]}"
            )
        else:
            _log_bridge(f"Cyberwave workflow trigger failed: action={action} error={exc}")

        if os.getenv("CYBERWAVE_WORKFLOW_STRICT") == "1":
            raise


def _workflow_id_for_action(action: str) -> str | None:
    key = WORKFLOW_ENV_KEYS_BY_ACTION.get(action)
    return os.getenv(key, "").strip() if key else None


def _workflow_trigger_node_for_action(action: str) -> str | None:
    key = WORKFLOW_TRIGGER_ENV_KEYS_BY_ACTION.get(action)
    return os.getenv(key, "").strip() if key else None


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

    if command.name in CAMERA_JOINT_POSITIONS_BY_COMMAND:
        _execute_camera_command(robot, command.name)
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


def _execute_camera_command(robot: Any, command_name: str) -> None:
    commands = getattr(robot, "commands", None)
    dynamic_method = getattr(commands, command_name, None) if commands else None
    if callable(dynamic_method):
        try:
            dynamic_method()
        except Exception as exc:
            _log_bridge(f"Cyberwave camera command failed: command={command_name} error={exc}")

    target_joints = _camera_joint_target(command_name)
    if target_joints:
        try:
            _smooth_camera_joints(robot, target_joints)
        except Exception as exc:
            _log_bridge(f"Cyberwave camera joint update failed: command={command_name} error={exc}")


def _camera_joint_target(command_name: str) -> dict[str, float]:
    return {
        **_LAST_CAMERA_JOINTS,
        **CAMERA_JOINT_POSITIONS_BY_COMMAND[command_name],
    }


def _smooth_camera_joints(robot: Any, target_joints: dict[str, float]) -> None:
    global _LAST_CAMERA_JOINTS

    steps = max(1, int(os.getenv("CYBERWAVE_CAMERA_JOINT_STEPS", "4")))
    delay = max(0.0, float(os.getenv("CYBERWAVE_CAMERA_JOINT_STEP_DELAY", "0.04")))
    start_joints = dict(_LAST_CAMERA_JOINTS)

    for step in range(1, steps + 1):
        eased = _ease_in_out(step / steps)
        positions = {
            name: start_joints.get(name, 0.0)
            + (target - start_joints.get(name, 0.0)) * eased
            for name, target in target_joints.items()
        }
        _publish_joint_positions(robot, positions)
        if step < steps:
            time.sleep(delay)

    _LAST_CAMERA_JOINTS = target_joints


def _publish_joint_positions(robot: Any, positions: dict[str, float]) -> None:
    if not positions:
        return

    resolver = getattr(robot, "_resolve_topic_and_payload", None)
    publisher = getattr(robot, "_publish_resolved", None)
    if callable(resolver) and callable(publisher):
        resolved = resolver(
            command="joint_update",
            data={"positions": positions},
            channel="joint_update",
        )
        publisher(resolved)
        return

    mqtt = getattr(getattr(robot, "client", None), "mqtt", None)
    if mqtt is not None and hasattr(mqtt, "update_joints_state"):
        mqtt.update_joints_state(robot.uuid, positions)
        return

    raise RuntimeError("Cyberwave robot does not support camera joint updates")


def _execute_commands(robot: Any, action: str, commands: tuple[RobotCommand, ...]) -> None:
    for command in commands:
        _log_bridge(f"Cyberwave command: action={action} command={command.name} args={command.args}")
        _execute_command(robot, command)


def _run_commands_background(
    robot: Any,
    action: str,
    commands: tuple[RobotCommand, ...],
) -> None:
    if not commands:
        return

    thread = threading.Thread(
        target=_execute_background_commands,
        args=(robot, action, commands),
        daemon=True,
    )
    thread.start()


def _execute_background_commands(
    robot: Any,
    action: str,
    commands: tuple[RobotCommand, ...],
) -> None:
    try:
        _execute_commands(robot, action, commands)
        _execute_free_roam(robot, action)
    except Exception as exc:
        _log_bridge(f"Robot background motion failed: action={action} error={exc}")


def _execute_free_roam(robot: Any, action: str) -> None:
    if not _should_free_roam():
        return

    target_position = SCENE_POSITIONS_BY_ACTION.get(action)
    if not target_position:
        return

    steps = max(0, int(os.getenv("ROBOT_FREE_ROAM_STEPS", "3")))
    if steps == 0:
        return

    radius = max(0.0, float(os.getenv("ROBOT_FREE_ROAM_RADIUS", "0.42")))
    delay = max(0.0, float(os.getenv("ROBOT_FREE_ROAM_STEP_DELAY", "0.45")))
    rng = random.Random(f"{action}:{time.monotonic_ns()}")

    _log_bridge(
        "Robot free roam: "
        f"action={action} steps={steps} radius={radius} "
        f"x_bounds={FREE_ROAM_X_BOUNDS} y_bounds={FREE_ROAM_Y_BOUNDS}"
    )

    for step in range(steps):
        offset_x = rng.uniform(-radius, radius)
        offset_y = rng.uniform(-radius, radius)
        roam_position = {
            "x": _clamp(target_position["x"] + offset_x, *FREE_ROAM_X_BOUNDS),
            "y": _clamp(target_position["y"] + offset_y, *FREE_ROAM_Y_BOUNDS),
            "z": target_position["z"],
        }
        yaw = rng.uniform(-38.0, 38.0)

        _log_bridge(
            "Robot free roam step: "
            f"{step + 1}/{steps} "
            f"x={round(roam_position['x'], 3)} "
            f"y={round(roam_position['y'], 3)} "
            f"yaw={round(yaw, 2)}"
        )
        robot.edit_position(**roam_position)
        robot.edit_rotation(yaw=yaw)
        if step < steps - 1:
            time.sleep(delay)


def _should_free_roam() -> bool:
    mode = _get_robot_mode()
    if mode != "simulation" and os.getenv("ROBOT_FREE_ROAM_LIVE") != "1":
        return False

    value = os.getenv("ROBOT_FREE_ROAM", "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(max(value, lower), upper)


def _should_update_scene_rotation(mode: str, action: str) -> bool:
    visibility_mode = os.getenv("CYBERWAVE_SIMULATION_VISIBILITY_MODE", "scene_edit")
    return mode == "simulation" and visibility_mode == "scene_edit" and action in SCENE_YAWS_BY_ACTION


def _should_update_scene_pose(mode: str, action: str) -> bool:
    visibility_mode = os.getenv("CYBERWAVE_SIMULATION_VISIBILITY_MODE", "scene_edit")
    return (
        mode == "simulation"
        and visibility_mode == "scene_edit"
        and action in SCENE_YAWS_BY_ACTION
        and action in SCENE_POSITIONS_BY_ACTION
    )


def _apply_scene_demo_pose(robot: Any, action: str) -> None:
    target_position = SCENE_POSITIONS_BY_ACTION[action]
    target_yaw = SCENE_YAWS_BY_ACTION[action]

    _log_bridge(
        "Cyberwave scene edit: "
        f"action={action} "
        f"smooth_edit_position x={target_position['x']} y={target_position['y']} z={target_position['z']} "
        f"smooth_edit_rotation yaw={target_yaw}"
    )
    _smooth_scene_position(robot, target_position)
    _smooth_scene_rotation(robot, target_yaw)


def _apply_scene_position(robot: Any, action: str) -> None:
    target_position = SCENE_POSITIONS_BY_ACTION[action]

    _log_bridge(
        "Cyberwave scene edit: "
        f"action={action} "
        f"smooth_edit_position x={target_position['x']} y={target_position['y']} z={target_position['z']}"
    )
    _smooth_scene_position(robot, target_position)


def _run_scene_rotation_background(robot: Any, action: str) -> None:
    target_yaw = SCENE_YAWS_BY_ACTION[action]
    thread = threading.Thread(
        target=_execute_background_scene_rotation,
        args=(robot, action, target_yaw),
        daemon=True,
    )
    thread.start()


def _execute_background_scene_rotation(robot: Any, action: str, target_yaw: float) -> None:
    try:
        _log_bridge(
            "Cyberwave scene edit: "
            f"action={action} "
            f"smooth_edit_rotation yaw={target_yaw}"
        )
        _smooth_scene_rotation(robot, target_yaw)
    except Exception as exc:
        _log_bridge(f"Robot background rotation failed: action={action} error={exc}")


def _smooth_scene_position(robot: Any, target_position: dict[str, float]) -> None:
    start_position = _get_current_position(robot)
    if start_position is None:
        robot.edit_position(**target_position)
        return

    steps = max(1, int(os.getenv("CYBERWAVE_SCENE_POSITION_STEPS", "12")))
    delay = max(0.0, float(os.getenv("CYBERWAVE_SCENE_POSITION_STEP_DELAY", "0.06")))
    for step in range(1, steps + 1):
        eased = _ease_in_out(step / steps)
        position = {
            axis: start_position[axis] + (target_position[axis] - start_position[axis]) * eased
            for axis in ("x", "y", "z")
        }
        robot.edit_position(**position)
        if step < steps:
            time.sleep(delay)


def _get_current_position(robot: Any) -> dict[str, float] | None:
    get_position = getattr(robot, "_get_current_position", None)
    if not callable(get_position):
        return None

    try:
        position = get_position()
    except Exception:
        return None

    try:
        return {
            "x": float(position["x"]),
            "y": float(position["y"]),
            "z": float(position["z"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


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


def _print_current_pose(action: str) -> None:
    from cyberwave import Cyberwave

    client = Cyberwave()
    client.affect(_get_robot_mode())
    robot = _get_robot(client)
    position = robot._get_current_position()
    rotation = robot._get_current_rotation()
    yaw = _yaw_from_rotation(rotation)

    print(f"SDK verification: action={action}")
    print(f"SDK verification: position={position}")
    print(f"SDK verification: yaw={round(yaw, 2) if yaw is not None else None}")


def _yaw_from_rotation(rotation: dict[str, float]) -> float | None:
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


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "point_demo_queue"
    send_robot_action(action)
    _print_current_pose(action)


if __name__ == "__main__":
    main()
