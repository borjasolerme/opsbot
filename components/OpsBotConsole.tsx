"use client";

import {
  Activity,
  BatteryCharging,
  Camera,
  CheckCircle2,
  Clock3,
  Mic,
  PackageSearch
} from "lucide-react";
import {
  type ComponentType,
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  intentOptions,
  type InterhumanSummary,
  type IntentId,
  type IntentResponse,
  type RobotAction,
  type RobotStatus
} from "@/lib/intent";

type RequestState =
  | "ready"
  | "listening"
  | "calling"
  | "speaking"
  | "speech_unavailable"
  | "error";
type ConversationTurn = { role: "user" | "assistant"; content: string };
type InteractionMedia = {
  media_base64: string;
  media_mime_type: string;
};

const robotActionLabels: Record<IntentResponse["robot_action"], string> = {
  point_checkin: "Pointing to check-in",
  point_lost_found: "Pointing to lost & found",
  point_charger: "Pointing to chargers",
  point_demo_queue: "Pointing to demo queue",
  look_around: "Looking around",
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
const interhumanMinimumClipMs = 3200;

function humanizeSignalLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function OpsBotConsole() {
  const [robotAction, setRobotAction] = useState<IntentResponse["robot_action"]>("idle");
  const [robotStatus, setRobotStatus] = useState<RobotStatus>("skipped");
  const [requestState, setRequestState] = useState<RequestState>("ready");
  const [lastIntent, setLastIntent] = useState<IntentId | null>(null);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [interhumanSummary, setInterhumanSummary] = useState<InterhumanSummary | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);

  const statusLabel = useMemo(() => {
    if (requestState === "calling") return "Calling Edge Function";
    if (requestState === "listening") return "Listening";
    if (requestState === "speaking") return "Speaking reply";
    if (requestState === "speech_unavailable") return "Speech unavailable";
    if (requestState === "error") return "Function error";
    return "Ready";
  }, [requestState]);
  const isBusy = requestState === "calling" || requestState === "listening";
  const primarySignal = interhumanSummary?.primary_signal;

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.srcObject = cameraPreviewStream;

    if (cameraPreviewStream) {
      void video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [cameraPreviewStream]);

  async function handleIntent(option: (typeof intentOptions)[number]) {
    setLastIntent(option.id);

    try {
      setRequestState("listening");
      await requestOpsBot({
        intent: option.id,
        message: option.request,
        ...(await captureInteractionMedia(interhumanMinimumClipMs))
      });
    } catch {
      setRobotAction("idle");
      setRobotStatus("failed");
      setRequestState("error");
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setRequestState("speech_unavailable");
      return;
    }

    try {
      const stream = await getInteractionStream();
      setCameraPreviewStream(stream);
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        setRequestState("calling");
        stopInteractionStream(stream);
        const mediaBlob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || "video/webm"
        });
        recordingChunksRef.current = [];

        if (mediaBlob.size === 0) {
          setRequestState("speech_unavailable");
          return;
        }

        const mediaBase64 = await blobToBase64(mediaBlob);
        setLastIntent(null);
        await requestOpsBot({
          audio_base64: mediaBase64,
          audio_mime_type: mediaBlob.type || "video/webm",
          media_base64: mediaBase64,
          media_mime_type: mediaBlob.type || "video/webm"
        });
      };

      recorder.onerror = () => {
        setIsRecording(false);
        stopInteractionStream(stream);
        setRequestState("speech_unavailable");
      };

      recorder.start();
      setIsRecording(true);
      setRequestState("listening");
    } catch {
      setRequestState("speech_unavailable");
    }
  }

  async function requestOpsBot(payload: {
    intent?: IntentId;
    message?: string;
    audio_base64?: string;
    audio_mime_type?: string;
    media_base64?: string;
    media_mime_type?: string;
  }) {
    const requestConversation = conversation;
    setRobotStatus("skipped");
    setInterhumanSummary(null);
    setRequestState("calling");

    try {
      const response = await fetch(intentFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...payload,
          conversation: requestConversation
        })
      });

      if (!response.ok) {
        throw new Error(`Intent function returned ${response.status}`);
      }

      const data = (await response.json()) as IntentResponse;
      setRobotAction(data.robot_action);
      setRobotStatus(data.robot_status ?? "skipped");
      setInterhumanSummary(data.interhuman_summary ?? null);
      const userMessage = data.user_message ?? payload.message;
      setConversation((currentConversation) =>
        [
          ...currentConversation,
          userMessage ? { role: "user" as const, content: userMessage } : null,
          { role: "assistant" as const, content: data.reply }
        ].filter((turn): turn is ConversationTurn => turn !== null).slice(-8)
      );

      playReplyAudio(data);
    } catch {
      setRobotAction("idle");
      setRobotStatus("failed");
      setRequestState("error");
    }
  }

  async function captureInteractionMedia(durationMs: number): Promise<InteractionMedia> {
    const stream = await getInteractionStream();
    setCameraPreviewStream(stream);
    const recorder = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];

    return await new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        stopInteractionStream(stream);
        reject(new Error("Interaction recording failed."));
      };

      recorder.onstop = async () => {
        stopInteractionStream(stream);
        const mediaBlob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });

        if (mediaBlob.size === 0) {
          reject(new Error("Interaction recording was empty."));
          return;
        }

        resolve({
          media_base64: await blobToBase64(mediaBlob),
          media_mime_type: mediaBlob.type || "video/webm"
        });
      };

      recorder.start();
      window.setTimeout(() => recorder.stop(), durationMs);
    });
  }

  function stopInteractionStream(stream: MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
    setCameraPreviewStream((currentStream) => (currentStream === stream ? null : currentStream));
  }

  async function getInteractionStream(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser media capture is unavailable.");
    }

    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });
  }

  function playReplyAudio(data: IntentResponse) {
    if (!data.audio_base64) {
      setRequestState("speech_unavailable");
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(`data:${data.audio_mime_type ?? "audio/mpeg"};base64,${data.audio_base64}`);
    audioRef.current = audio;
    audio.onplay = () => setRequestState("speaking");
    audio.onended = () => setRequestState("ready");
    audio.onerror = () => setRequestState("speech_unavailable");
    void audio.play().catch(() => setRequestState("speech_unavailable"));
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
                (isBusy || requestState === "speaking") && "bg-warning",
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

      <aside
        className="fixed right-3 top-3 z-40 w-[min(240px,calc(100vw-1.5rem))] overflow-hidden rounded-[18px] border border-border bg-background shadow-[0_16px_42px_-28px_rgba(0,0,0,0.55)] sm:right-5 sm:top-5 sm:w-[240px]"
        aria-label="Camera preview and Interhuman signal"
      >
        <div className="relative aspect-[4/3] bg-muted">
          <video
            aria-label="Camera preview"
            autoPlay
            className={cn(
              "h-full w-full object-cover transition-opacity",
              !cameraPreviewStream && "opacity-0"
            )}
            muted
            playsInline
            ref={videoRef}
          />
          {!cameraPreviewStream && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Camera aria-hidden="true" className="h-4 w-4" />
            </div>
          )}
          <div
            className={cn(
              "absolute left-2 top-2 inline-flex min-h-6 items-center gap-1.5 rounded-full border border-border bg-background/92 px-2 text-[11px] font-medium leading-4 text-foreground shadow-xs backdrop-blur",
              !cameraPreviewStream && "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-muted-foreground/45",
                cameraPreviewStream && "bg-success"
              )}
              aria-hidden="true"
            />
            {cameraPreviewStream ? "Camera on" : "Camera idle"}
          </div>

          <div className="absolute inset-x-3 bottom-3 text-foreground [text-shadow:0_1px_2px_rgba(255,255,255,0.9)]">
            <div className="flex items-center gap-1.5 text-[11px] font-medium leading-4 text-muted-foreground">
              <Activity aria-hidden="true" className="h-3.5 w-3.5" />
              Interhuman signal
            </div>
            <div className="mt-1.5">
              {primarySignal ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold leading-4">
                      {humanizeSignalLabel(primarySignal.type)}
                    </p>
                    {primarySignal.probability && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
                        {humanizeSignalLabel(primarySignal.probability)}
                      </span>
                    )}
                  </div>
                  {primarySignal.rationale && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {primarySignal.rationale}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Waiting for the next analyzed interaction.
                </p>
              )}
            </div>
            {(interhumanSummary?.engagement_state || interhumanSummary?.quality_index) && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] leading-4 text-muted-foreground">
                {interhumanSummary.engagement_state && (
                  <span className="rounded-full bg-secondary px-2 py-0.5">
                    {humanizeSignalLabel(interhumanSummary.engagement_state)}
                  </span>
                )}
                {typeof interhumanSummary.quality_index === "number" && (
                  <span className="rounded-full bg-secondary px-2 py-0.5">
                    CQI {interhumanSummary.quality_index}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

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
                  disabled={isBusy}
                  key={option.id}
                  onClick={() => handleIntent(option)}
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

          <Button
            className="mt-4 h-14 w-full gap-3 rounded-[18px] text-base"
            disabled={requestState === "calling"}
            onClick={toggleRecording}
            type="button"
            variant={isRecording ? "default" : "secondary"}
          >
            <Mic aria-hidden="true" />
            {isRecording ? "Stop" : "Talk"}
          </Button>
        </div>

        <div className="flex min-w-0 flex-col md:pt-[70px]">
          <div
            className="robot-stage h-full min-h-80 overflow-hidden rounded-[28px] border border-border bg-secondary max-[420px]:min-h-[280px]"
            data-action={robotAction}
            data-loading={isBusy}
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
              <div className="robot-loader" />
              <div className="robot-pointer" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
