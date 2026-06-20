import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function getSupabaseSecretKey(): string | undefined {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, string>;
      return parsed.default;
    } catch {
      return undefined;
    }
  }

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseSecretKey = getSupabaseSecretKey();
const supabaseAdmin =
  supabaseUrl && supabaseSecretKey
    ? createClient(supabaseUrl, supabaseSecretKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : undefined;

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

function getLoggedIntent(intent: unknown): string {
  return typeof intent === "string" && intent.length > 0 ? intent : "unknown";
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

  const response = resolveIntent(payload.intent);

  if (!supabaseAdmin) {
    return Response.json(
      { error: "Intent logging is not configured." },
      { status: 500, headers: corsHeaders }
    );
  }

  const { error } = await supabaseAdmin.from("intent_logs").insert({
    intent: getLoggedIntent(payload.intent),
    reply: response.reply,
    robot_action: response.robot_action
  });

  if (error) {
    return Response.json(
      { error: "Intent logging failed." },
      { status: 500, headers: corsHeaders }
    );
  }

  return Response.json(response, {
    headers: corsHeaders
  });
});
