"use client";

import {
  BatteryCharging,
  CheckCircle2,
  Clock3,
  PackageSearch
} from "lucide-react";
import { type ComponentType, type CSSProperties, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  intentOptions,
  type IntentId,
  type IntentResponse,
  type RobotAction,
  type RobotStatus
} from "@/lib/intent";

type RequestState = "ready" | "calling" | "speaking" | "speech_unavailable" | "error";

const robotActionLabels: Record<IntentResponse["robot_action"], string> = {
  point_checkin: "Pointing to check-in",
  point_lost_found: "Pointing to lost & found",
  point_charger: "Pointing to chargers",
  point_demo_queue: "Pointing to demo queue",
  wave: "Waving",
  idle: "Idle"
};

const robotStatusLabels: Record<RobotStatus, string> = {
  sent: "Robot: sent",
  failed: "Robot: failed",
  skipped: "Robot: skipped"
};

const intentIcons: Record<IntentId, ComponentType<{ className?: string }>> = {
  check_in: CheckCircle2,
  lost_item: PackageSearch,
  charger_request: BatteryCharging,
  demo_schedule: Clock3
};

const intentIconSurfaces: Record<IntentId, { className: string; style: CSSProperties }> = {
  check_in: {
    className: "text-[#ff5a5f]",
    style: {
      backgroundColor: "#fff1f1",
      backgroundImage:
        "radial-gradient(circle at 72% 28%, rgba(255, 90, 95, 0.18) 0 24%, transparent 46%), radial-gradient(circle at 70% 82%, rgba(255, 186, 188, 0.34) 0 28%, transparent 52%), linear-gradient(135deg, #fff8f8 0%, #ffeded 100%)"
    }
  },
  lost_item: {
    className: "text-[#fc642d]",
    style: {
      backgroundColor: "#fff4ed",
      backgroundImage:
        "radial-gradient(circle at 76% 30%, rgba(252, 100, 45, 0.17) 0 24%, transparent 46%), radial-gradient(circle at 72% 84%, rgba(255, 195, 143, 0.3) 0 29%, transparent 54%), linear-gradient(135deg, #fff9f4 0%, #fff0e6 100%)"
    }
  },
  charger_request: {
    className: "text-[#00a699]",
    style: {
      backgroundColor: "#edf8f7",
      backgroundImage:
        "radial-gradient(circle at 76% 30%, rgba(0, 166, 153, 0.15) 0 25%, transparent 48%), radial-gradient(circle at 70% 82%, rgba(128, 214, 207, 0.28) 0 29%, transparent 54%), linear-gradient(135deg, #f5fcfb 0%, #e8f7f5 100%)"
    }
  },
  demo_schedule: {
    className: "text-[#ff5a5f]",
    style: {
      backgroundColor: "#fff1f1",
      backgroundImage:
        "radial-gradient(circle at 72% 28%, rgba(255, 90, 95, 0.18) 0 24%, transparent 46%), radial-gradient(circle at 70% 82%, rgba(255, 186, 188, 0.34) 0 28%, transparent 52%), linear-gradient(135deg, #fff8f8 0%, #ffeded 100%)"
    }
  }
};

const robotDestinations: Array<{
  action: Exclude<RobotAction, "idle" | "wave">;
  label: string;
  helper: string;
  contentClassName: string;
}> = [
  {
    action: "point_checkin",
    label: "Check-in",
    helper: "Arrival desk",
    contentClassName: "items-start text-left"
  },
  {
    action: "point_lost_found",
    label: "Lost & found",
    helper: "Staff handoff",
    contentClassName: "items-end text-right"
  },
  {
    action: "point_charger",
    label: "Chargers",
    helper: "Accessories table",
    contentClassName: "items-start text-left"
  },
  {
    action: "point_demo_queue",
    label: "Demo queue",
    helper: "Stage timing",
    contentClassName: "items-end text-right"
  }
];

const intentFunctionUrl =
  process.env.NEXT_PUBLIC_INTENT_FUNCTION_URL ??
  "http://127.0.0.1:54331/functions/v1/intent";

export function OpsBotConsole() {
  const [robotAction, setRobotAction] = useState<IntentResponse["robot_action"]>("idle");
  const [robotStatus, setRobotStatus] = useState<RobotStatus>("skipped");
  const [requestState, setRequestState] = useState<RequestState>("ready");
  const [lastIntent, setLastIntent] = useState<IntentId | null>(null);

  const statusLabel = useMemo(() => {
    if (requestState === "calling") return "Calling Edge Function";
    if (requestState === "speaking") return "Speaking reply";
    if (requestState === "speech_unavailable") return "Speech unavailable";
    if (requestState === "error") return "Function error";
    return "Ready";
  }, [requestState]);

  async function handleIntent(intent: IntentId) {
    setLastIntent(intent);
    setRobotStatus("skipped");
    setRequestState("calling");

    try {
      const response = await fetch(intentFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ intent })
      });

      if (!response.ok) {
        throw new Error(`Intent function returned ${response.status}`);
      }

      const data = (await response.json()) as IntentResponse;
      setRobotAction(data.robot_action);
      setRobotStatus(data.robot_status ?? "skipped");

      speakReply(data.reply);
    } catch {
      setRobotAction("idle");
      setRobotStatus("failed");
      setRequestState("error");
    }
  }

  function speakReply(message: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setRequestState("speech_unavailable");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setRequestState("speaking");
    utterance.onend = () => setRequestState("ready");
    utterance.onerror = () => setRequestState("speech_unavailable");
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-8 bg-background px-4 py-4 text-foreground sm:px-6 sm:py-8">
      <section
        className="flex flex-col items-start gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between"
        aria-labelledby="page-title"
      >
        <div>
          <h1 id="page-title" className="text-[32px] font-semibold leading-10 tracking-normal">
            Phone front desk
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <div className="inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] leading-4 text-muted-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-success",
                (requestState === "calling" || requestState === "speaking") && "bg-warning",
                (requestState === "speech_unavailable" || requestState === "error") &&
                  "bg-destructive"
              )}
              aria-hidden="true"
            />
            {statusLabel}
          </div>
          <div className="inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] leading-4 text-muted-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-muted-foreground/45",
                robotStatus === "sent" && "bg-success",
                robotStatus === "failed" && "bg-destructive"
              )}
              aria-hidden="true"
            />
            {robotStatusLabels[robotStatus]}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)] md:gap-10" aria-label="OpsBot controls and robot state">
        <div className="min-w-0">
          <div>
            <p className="text-xs font-medium leading-4 text-muted-foreground">
              Visitor request
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-[26px] tracking-normal">
              Ask OpsBot
            </h2>
          </div>

          <div className="mt-6 grid gap-3">
            {intentOptions.map((option) => {
              const Icon = intentIcons[option.id];
              const iconSurface = intentIconSurfaces[option.id];

              return (
                <Button
                  className={cn(
                    "h-[92px] w-full justify-start gap-4 rounded-[18px] border border-border bg-background px-4 text-left shadow-xs transition-[background-color,border-color,box-shadow,transform] hover:border-[#c9c9c9] hover:bg-background hover:shadow-[0_12px_24px_-22px_rgba(0,0,0,0.55)] active:translate-y-px [&_svg]:size-6",
                    lastIntent === option.id && "border-foreground bg-background"
                  )}
                  disabled={requestState === "calling"}
                  key={option.id}
                  onClick={() => handleIntent(option.id)}
                  type="button"
                  variant="secondary"
                >
                  <span
                    className={cn(
                      "relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px]",
                      iconSurface.className
                    )}
                    style={iconSurface.style}
                  >
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="relative z-10 flex min-w-0 flex-col">
                    <span className="truncate text-lg font-medium leading-6">{option.label}</span>
                    <span className="truncate text-base font-normal leading-6 text-muted-foreground">
                      {option.helper}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 border-t border-border pt-8 md:border-l md:border-t-0 md:pl-10 md:pt-0">
          <div
            className="robot-stage min-h-80 overflow-hidden rounded-[28px] border border-border bg-secondary max-[420px]:min-h-[280px]"
            data-action={robotAction}
            data-speaking={requestState === "speaking"}
            aria-label={robotActionLabels[robotAction]}
          >
            <div className="absolute inset-3 grid grid-cols-2 gap-3 sm:inset-4 sm:gap-4">
              {robotDestinations.map((destination) => (
                <span
                  className={cn(
                    "robot-destination flex min-h-24 flex-col justify-end rounded-[22px] border border-border bg-background p-4 transition-[background-color,border-color,box-shadow]",
                    destination.contentClassName,
                    robotAction === destination.action && "is-active"
                  )}
                  key={destination.action}
                >
                  <span className="max-w-[72%]">
                    <span className="block text-base font-medium leading-5 text-foreground">
                      {destination.label}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                      {destination.helper}
                    </span>
                  </span>
                </span>
              ))}
            </div>
            <div className="absolute left-1/2 top-[54%] h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-[30px] border border-border bg-background shadow-[0_24px_48px_-28px_rgba(0,0,0,0.45)] transition-transform">
              <div className="absolute inset-x-5 top-5 h-1 rounded-full bg-muted" />
              <div className="flex justify-center gap-5 pt-11">
                <span className="robot-eye h-3 w-3 rounded-full bg-foreground" />
                <span className="robot-eye h-3 w-3 rounded-full bg-foreground" />
              </div>
              <div className="robot-mouth mx-auto mt-6 h-1 w-9 rounded-full bg-border" />
              <div className="robot-pointer" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
