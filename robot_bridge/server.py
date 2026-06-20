from __future__ import annotations

import os
from typing import Callable

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .actions import is_valid_action


ActionDispatcher = Callable[[str], None]


class ActionRequest(BaseModel):
    action: str


def dispatch_robot_action(action: str) -> None:
    from .cyberwave_adapter import send_robot_action

    send_robot_action(action, wait_for_motion=True)


def create_app(dispatcher: ActionDispatcher = dispatch_robot_action) -> FastAPI:
    app = FastAPI(title="OpsBot Robot Bridge")

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/")
    @app.post("/action")
    def action(request: ActionRequest) -> dict[str, object]:
        if not is_valid_action(request.action):
            raise HTTPException(status_code=400, detail="Unsupported or missing action")

        _dispatch_action(dispatcher, request.action)
        return {"ok": True, "action": request.action, "robot_status": "sent"}

    return app


def _dispatch_action(dispatcher: ActionDispatcher, action: str) -> None:
    try:
        dispatcher(action)
    except Exception as exc:
        print(f"Robot action failed: action={action} error={exc}", flush=True)
        raise HTTPException(status_code=502, detail="Robot action failed") from exc


app = create_app()


def run_server(
    host: str | None = None,
    port: int | None = None,
    dispatcher: ActionDispatcher = dispatch_robot_action,
) -> None:
    import uvicorn

    server_host = host or os.getenv("ROBOT_BRIDGE_HOST", "127.0.0.1")
    server_port = port or int(os.getenv("ROBOT_BRIDGE_PORT", "8765"))
    server_app = app if dispatcher is dispatch_robot_action else create_app(dispatcher)
    print(f"OpsBot robot bridge listening on http://{server_host}:{server_port}", flush=True)
    uvicorn.run(server_app, host=server_host, port=server_port, log_level="warning")


if __name__ == "__main__":
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nOpsBot robot bridge stopped")
