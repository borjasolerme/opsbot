import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type IntentId = "check_in" | "lost_item" | "charger_request" | "demo_schedule";
type RobotAction =
  | "point_checkin"
  | "point_lost_found"
  | "point_charger"
  | "point_demo_queue"
  | "wave"
  | "idle";

type IntentResponse = {
  reply: string;
  robot_action: RobotAction;
};

const mockedReplies: Record<IntentId, IntentResponse> = {
  check_in: {
    reply: "Welcome. Check-in closes at 10:30 and hacking starts at 10:30.",
    robot_action: "point_checkin"
  },
  lost_item: {
    reply: "Please place the item in Lost & Found. I'll register it for staff.",
    robot_action: "point_lost_found"
  },
  charger_request: {
    reply: "You can ask staff for a charger or check the shared accessories table.",
    robot_action: "point_charger"
  },
  demo_schedule: {
    reply: "Code freeze is at 17:00 and live demos start at 17:30.",
    robot_action: "point_demo_queue"
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function resolveIntent(intent: unknown): IntentResponse {
  if (
    intent === "check_in" ||
    intent === "lost_item" ||
    intent === "charger_request" ||
    intent === "demo_schedule"
  ) {
    return mockedReplies[intent];
  }

  return {
    reply: "I can help with check-in, lost items, chargers, or the demo schedule.",
    robot_action: "idle"
  };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Use POST with an intent field." },
      { status: 405, headers: corsHeaders }
    );
  }

  let payload: { intent?: unknown } = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  return Response.json(resolveIntent(payload.intent), {
    headers: corsHeaders
  });
});
