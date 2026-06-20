"use client";

import {
  BatteryCharging,
  CheckCircle2,
  Clock3,
  PackageSearch,
  Volume2
} from "lucide-react";
import { type ComponentType, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { intentOptions, type IntentId, type IntentResponse } from "@/lib/intent";

type RequestState = "ready" | "calling" | "speaking" | "speech_unavailable" | "error";

const robotActionLabels: Record<IntentResponse["robot_action"], string> = {
  point_checkin: "Pointing to check-in",
  point_lost_found: "Pointing to lost & found",
  point_charger: "Pointing to chargers",
  point_demo_queue: "Pointing to demo queue",
  wave: "Waving",
  idle: "Idle"
};

const intentIcons: Record<IntentId, ComponentType<{ className?: string }>> = {
  check_in: CheckCircle2,
  lost_item: PackageSearch,
  charger_request: BatteryCharging,
  demo_schedule: Clock3
};

const intentGradients: Record<IntentId, string> = {
  check_in:
    "before:bg-[radial-gradient(circle_at_92%_28%,rgba(40,169,72,0.22),transparent_30%),radial-gradient(circle_at_78%_78%,rgba(0,227,196,0.18),transparent_34%),linear-gradient(to_left,rgba(0,107,255,0.10),transparent_78%)]",
  lost_item:
    "before:bg-[radial-gradient(circle_at_92%_28%,rgba(242,39,130,0.18),transparent_30%),radial-gradient(circle_at_78%_78%,rgba(160,0,248,0.16),transparent_34%),linear-gradient(to_left,rgba(0,107,255,0.10),transparent_78%)]",
  charger_request:
    "before:bg-[radial-gradient(circle_at_92%_28%,rgba(255,147,0,0.22),transparent_30%),radial-gradient(circle_at_78%_78%,rgba(76,225,94,0.16),transparent_34%),linear-gradient(to_left,rgba(255,197,67,0.12),transparent_78%)]",
  demo_schedule:
    "before:bg-[radial-gradient(circle_at_92%_28%,rgba(0,107,255,0.18),transparent_30%),radial-gradient(circle_at_78%_78%,rgba(201,121,255,0.16),transparent_34%),linear-gradient(to_left,rgba(0,227,196,0.10),transparent_78%)]"
};

export function OpsBotConsole() {
  const [reply, setReply] = useState("Tap a request to ask OpsBot.");
  const [robotAction, setRobotAction] = useState<IntentResponse["robot_action"]>("idle");
  const [requestState, setRequestState] = useState<RequestState>("ready");
  const [lastIntent, setLastIntent] = useState<IntentId | null>(null);

  const statusLabel = useMemo(() => {
    if (requestState === "calling") return "Calling /intent";
    if (requestState === "speaking") return "Speaking reply";
    if (requestState === "speech_unavailable") return "Speech unavailable";
    if (requestState === "error") return "Function error";
    return "Ready";
  }, [requestState]);

  async function handleIntent(intent: IntentId) {
    setLastIntent(intent);
    setRequestState("calling");

    try {
      const response = await fetch("/intent", {
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
      setReply(data.reply);
      setRobotAction(data.robot_action);

      speakReply(data.reply);
    } catch {
      setReply("OpsBot could not reach /intent. Try again from the phone app.");
      setRobotAction("idle");
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
        <div
          className="inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] leading-4 text-muted-foreground"
          aria-live="polite"
        >
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
      </section>

      <section
        className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)] md:gap-10"
        aria-label="OpsBot controls and robot state"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-xs font-medium leading-4 text-muted-foreground">
              Visitor request
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-[26px] tracking-normal">
              Ask OpsBot
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {intentOptions.map((option) => {
              const Icon = intentIcons[option.id];

              return (
                <Button
                  className={cn(
                    "relative h-16 justify-start gap-3 overflow-hidden border bg-background px-3 text-left transition-transform before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:[mask-image:linear-gradient(to_left,black_0%,black_42%,transparent_100%)] hover:bg-background active:translate-y-px",
                    intentGradients[option.id],
                    lastIntent === option.id && "border-ring bg-blue-50 hover:bg-blue-50"
                  )}
                  disabled={requestState === "calling"}
                  key={option.id}
                  onClick={() => handleIntent(option.id)}
                  type="button"
                  variant="secondary"
                >
                  <Icon className="relative z-10 text-muted-foreground" aria-hidden="true" />
                  <span className="relative z-10 flex min-w-0 flex-col">
                    <span className="truncate text-base font-medium leading-5">{option.label}</span>
                    <span className="truncate text-[13px] font-normal leading-4 text-muted-foreground">
                      {option.helper}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="rounded-md border border-border bg-secondary p-4" aria-live="polite">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium leading-4 text-muted-foreground">
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              Browser reply
            </p>
            <p className="text-base leading-6 text-foreground">{reply}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 border-t border-border pt-8 md:border-l md:border-t-0 md:pl-10 md:pt-0">
          <div
            className="robot-stage min-h-80 overflow-hidden rounded-md border border-border bg-secondary max-[420px]:min-h-[280px]"
            data-action={robotAction}
            aria-label={robotActionLabels[robotAction]}
          >
            <div className="absolute inset-4 grid grid-cols-2 gap-2">
              {["Check-in", "Lost & found", "Chargers", "Demo queue"].map((label) => (
                <span
                  className="flex min-h-16 items-center justify-center rounded-md border border-border bg-background px-2 text-center text-xs leading-4 text-muted-foreground"
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="absolute left-1/2 top-[54%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-xs transition-transform">
              <div className="flex justify-center gap-4 pt-[34px]">
                <span className="h-2.5 w-2.5 rounded-full bg-foreground" />
                <span className="h-2.5 w-2.5 rounded-full bg-foreground" />
              </div>
              <div className="robot-pointer" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
