export const intentIds = [
  "check_in",
  "lost_item",
  "charger_request",
  "demo_schedule"
] as const;

export type IntentId = (typeof intentIds)[number];

export type RobotAction =
  | "point_checkin"
  | "point_lost_found"
  | "point_charger"
  | "point_demo_queue"
  | "wave"
  | "idle";
export type RobotStatus = "sent" | "failed" | "skipped";

export type IntentResponse = {
  reply: string;
  robot_action: RobotAction;
  robot_status?: RobotStatus;
};

export const intentOptions: Array<{
  id: IntentId;
  label: string;
  helper: string;
}> = [
  {
    id: "check_in",
    label: "Check-in",
    helper: "Arrival desk"
  },
  {
    id: "lost_item",
    label: "Lost item",
    helper: "Staff handoff"
  },
  {
    id: "charger_request",
    label: "Charger request",
    helper: "Accessories table"
  },
  {
    id: "demo_schedule",
    label: "Demo schedule",
    helper: "Stage timing"
  }
];

const mockedReplies = {
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
} satisfies Record<IntentId, IntentResponse>;

export function isIntentId(value: unknown): value is IntentId {
  return typeof value === "string" && intentIds.includes(value as IntentId);
}

export function resolveIntent(intent: unknown): IntentResponse {
  if (!isIntentId(intent)) {
    return {
      reply: "I can help with check-in, lost items, chargers, or the demo schedule.",
      robot_action: "idle"
    };
  }

  return mockedReplies[intent];
}
