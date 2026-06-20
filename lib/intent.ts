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
  | "look_around"
  | "wave"
  | "idle";
export type RobotStatus = "sent" | "failed" | "skipped";
export type InterhumanSignalSummary = {
  type: string;
  probability?: string;
  rationale?: string;
  start?: number;
  end?: number;
};

export type InterhumanSummary = {
  status: "analyzed" | "failed" | "skipped";
  primary_signal?: InterhumanSignalSummary;
  engagement_state?: string;
  quality_index?: number;
};

export type IntentResponse = {
  reply: string;
  robot_action: RobotAction;
  robot_status?: RobotStatus;
  intent_log_id?: string;
  audio_base64?: string;
  audio_mime_type?: string;
  user_message?: string;
  interhuman_summary?: InterhumanSummary;
};

export const intentOptions: Array<{
  id: IntentId;
  label: string;
  helper: string;
  request: string;
}> = [
  {
    id: "check_in",
    label: "Check-in",
    helper: "Arrival desk",
    request: "I need to check in for the event."
  },
  {
    id: "lost_item",
    label: "Lost item",
    helper: "Staff handoff",
    request: "I found a lost item and need to hand it to staff."
  },
  {
    id: "charger_request",
    label: "Charger request",
    helper: "Accessories table",
    request: "I need help finding a charger."
  },
  {
    id: "demo_schedule",
    label: "Demo schedule",
    helper: "Stage timing",
    request: "I want to know when demos happen."
  }
];

export function isIntentId(value: unknown): value is IntentId {
  return typeof value === "string" && intentIds.includes(value as IntentId);
}

export const robotActionsByIntent = {
  check_in: "point_checkin",
  lost_item: "point_lost_found",
  charger_request: "point_charger",
  demo_schedule: "point_demo_queue"
} satisfies Record<IntentId, RobotAction>;

export function robotActionForIntent(intent: unknown): RobotAction {
  return isIntentId(intent) ? robotActionsByIntent[intent] : "idle";
}
