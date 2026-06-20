"use client";

import {
  BatteryCharging,
  CheckCircle2,
  Clock3,
  PackageSearch
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

const intentIconSurfaces: Record<IntentId, string> = {
  check_in: "bg-[#fff1f1] text-[#ff5a5f]",
  lost_item: "bg-[#fff4ed] text-[#fc642d]",
  charger_request: "bg-[#edf8f7] text-[#00a699]",
  demo_schedule: "bg-[#fff1f1] text-[#ff5a5f]"
};

export function OpsBotConsole() {
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
      setRobotAction(data.robot_action);

      speakReply(data.reply);
    } catch {
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
                      intentIconSurfaces[option.id]
                    )}
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
