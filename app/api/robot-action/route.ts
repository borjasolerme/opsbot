import { NextResponse } from "next/server";
import { robotActionsByIntent, type RobotAction, type RobotStatus } from "@/lib/intent";

const robotActions = new Set<RobotAction>([
  ...Object.values(robotActionsByIntent),
  "look_around",
  "wave",
  "idle"
]);

type RobotActionRequest = {
  action?: unknown;
  intent_log_id?: unknown;
};

function getBridgeUrl(): string {
  const bridgeUrl =
    process.env.NEXT_SERVER_ROBOT_BRIDGE_URL ??
    process.env.ROBOT_BRIDGE_LOCAL_URL ??
    process.env.ROBOT_BRIDGE_URL ??
    "http://127.0.0.1:8765";

  if (bridgeUrl.includes("opsbot_robot_bridge")) {
    return "http://127.0.0.1:8765";
  }

  return bridgeUrl;
}

function getActionUrl(): string {
  const bridgeUrl = getBridgeUrl();

  if (bridgeUrl.endsWith("/action")) {
    return bridgeUrl;
  }

  return new URL("action", bridgeUrl.endsWith("/") ? bridgeUrl : `${bridgeUrl}/`).toString();
}

async function updateIntentLogStatus(intentLogId: string, robotStatus: RobotStatus) {
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:54331";
  const serviceRoleKey =
    process.env.OPSBOT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return;
  }

  await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/intent_logs?id=eq.${intentLogId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ robot_status: robotStatus }),
    cache: "no-store"
  }).catch(() => undefined);
}

async function sendRobotAction(action: RobotAction): Promise<RobotStatus> {
  if (action === "idle") {
    return "skipped";
  }

  try {
    const response = await fetch(getActionUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action }),
      cache: "no-store"
    });

    if (!response.ok) {
      return "failed";
    }

    const data = (await response.json().catch(() => undefined)) as
      | { ok?: unknown; robot_status?: unknown }
      | undefined;

    if (data?.robot_status === "sent" || data?.ok === true) {
      return "sent";
    }

    if (data?.robot_status === "skipped") {
      return "skipped";
    }

    return "failed";
  } catch {
    return "failed";
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RobotActionRequest;
  const action = body.action;

  if (typeof action !== "string" || !robotActions.has(action as RobotAction)) {
    return NextResponse.json(
      { ok: false, robot_status: "failed" satisfies RobotStatus, error: "Unsupported robot action." },
      { status: 400 }
    );
  }

  const robotStatus = await sendRobotAction(action as RobotAction);
  const intentLogId = typeof body.intent_log_id === "string" ? body.intent_log_id : undefined;

  if (intentLogId) {
    await updateIntentLogStatus(intentLogId, robotStatus);
  }

  return NextResponse.json({
    ok: robotStatus === "sent" || robotStatus === "skipped",
    action,
    robot_status: robotStatus
  });
}
