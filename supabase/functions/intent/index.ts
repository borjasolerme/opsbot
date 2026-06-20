import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type IntentId = "check_in" | "lost_item" | "charger_request" | "demo_schedule";
type RobotAction =
  | "point_checkin"
  | "point_lost_found"
  | "point_charger"
  | "point_demo_queue"
  | "look_around"
  | "wave"
  | "idle";
type RobotStatus = "sent" | "failed" | "skipped";
type SourceKey = "luma_event" | "talent_garden";
type ContextStatus = "extracted" | "failed" | "skipped";
type InterhumanStatus = "analyzed" | "failed" | "skipped";

type IntentReply = {
  reply: string;
  robot_action: RobotAction;
  audio_base64: string;
  audio_mime_type: string;
  user_message?: string;
  interhuman_summary?: InterhumanSummary;
};

type IntentResponse = IntentReply & {
  robot_status: RobotStatus;
};

type IntentPayload = {
  intent?: unknown;
  message?: unknown;
  conversation?: unknown;
  audio_base64?: unknown;
  audio_mime_type?: unknown;
  media_base64?: unknown;
  media_mime_type?: unknown;
};

type IntentContext = {
  status: ContextStatus;
  source_key: SourceKey;
  source_url: string;
  data: Record<string, unknown>;
  error?: string;
};

type InterhumanContext = {
  status: InterhumanStatus;
  data: Record<string, unknown>;
  error?: string;
};

type InterhumanSignalSummary = {
  type: string;
  probability?: string;
  rationale?: string;
  start?: number;
  end?: number;
};

type InterhumanSummary = {
  status: InterhumanStatus;
  primary_signal?: InterhumanSignalSummary;
  engagement_state?: string;
  quality_index?: number;
};

type SourceConfig = {
  source_key: SourceKey;
  env_name: string;
  default_url: string;
  prompt: string;
  schema: Record<string, unknown>;
};

type ReplyContext = {
  intent: unknown;
  message?: string;
  conversation: ConversationTurn[];
  robot_action: RobotAction;
  expected_robot_action?: RobotAction;
  source_context: IntentContext[];
  interhuman_context: InterhumanContext;
};

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

type OpenAiDecision = {
  reply: string;
  robot_action: RobotAction;
};

const robotActions: Record<IntentId, RobotAction> = {
  check_in: "point_checkin",
  lost_item: "point_lost_found",
  charger_request: "point_charger",
  demo_schedule: "point_demo_queue"
};

const sourceConfigs: Record<IntentId, SourceConfig> = {
  check_in: {
    source_key: "luma_event",
    env_name: "LUMA_EVENT_URL",
    default_url: "https://luma.com/mmc68m0b?tk=O68Z91",
    prompt:
      "Extract only factual event title, venue, start time, and visitor check-in/start instructions visible on the page.",
    schema: {
      type: "object",
      properties: {
        event_title: { type: "string" },
        venue: { type: "string" },
        start_time: { type: "string" },
        check_in_instructions: { type: "string" },
        start_instructions: { type: "string" }
      }
    }
  },
  lost_item: {
    source_key: "talent_garden",
    env_name: "TALENT_GARDEN_URL",
    default_url: "https://talentgarden.com/it/coworking/milano-calabiana",
    prompt:
      "Extract only factual venue address, reception/front-desk details, contact details, or help-point information visible on the page.",
    schema: {
      type: "object",
      properties: {
        venue_address: { type: "string" },
        reception_or_front_desk: { type: "string" },
        contact_or_help_point: { type: "string" }
      }
    }
  },
  charger_request: {
    source_key: "luma_event",
    env_name: "LUMA_EVENT_URL",
    default_url: "https://luma.com/mmc68m0b?tk=O68Z91",
    prompt:
      "Extract only public people, speakers, organizers, hosts, or event staff visible on the page who could help a visitor.",
    schema: {
      type: "object",
      properties: {
        people: { type: "array", items: { type: "string" } },
        speakers: { type: "array", items: { type: "string" } },
        organizers: { type: "array", items: { type: "string" } },
        attendee_list_private: { type: "boolean" }
      }
    }
  },
  demo_schedule: {
    source_key: "luma_event",
    env_name: "LUMA_EVENT_URL",
    default_url: "https://luma.com/mmc68m0b?tk=O68Z91",
    prompt:
      "Extract only factual agenda, schedule milestones, code-freeze time, and demo time visible on the page.",
    schema: {
      type: "object",
      properties: {
        agenda: { type: "array", items: { type: "string" } },
        code_freeze: { type: "string" },
        demo_time: { type: "string" },
        schedule: { type: "array", items: { type: "string" } }
      }
    }
  }
};

const contextCache = new Map<string, { expires_at: number; context: IntentContext }>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

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

const robotBridgeUrl = Deno.env.get("ROBOT_BRIDGE_URL");
const scrapeGraphApiKey = Deno.env.get("SGAI_API_KEY") ?? Deno.env.get("SCRAPEGRAPH_API_KEY");
const scrapeGraphApiUrl =
  Deno.env.get("SCRAPEGRAPH_EXTRACT_URL") ?? "https://v2-api.scrapegraphai.com/api/extract";
const scrapeGraphTimeoutMs = Number(Deno.env.get("SCRAPEGRAPH_TIMEOUT_MS") ?? "4000");
const contextCacheTtlMs = Number(Deno.env.get("SCRAPEGRAPH_CONTEXT_CACHE_TTL_MS") ?? "300000");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const openAiResponsesUrl = Deno.env.get("OPENAI_RESPONSES_URL") ?? "https://api.openai.com/v1/responses";
const openAiSpeechUrl = Deno.env.get("OPENAI_SPEECH_URL") ?? "https://api.openai.com/v1/audio/speech";
const openAiResponseModel = Deno.env.get("OPENAI_RESPONSE_MODEL") ?? "gpt-4.1-mini";
const openAiTtsModel = Deno.env.get("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts";
const openAiTtsVoice = Deno.env.get("OPENAI_TTS_VOICE") ?? "coral";
const openAiTtsFormat = Deno.env.get("OPENAI_TTS_FORMAT") ?? "mp3";
const openAiTranscriptionUrl =
  Deno.env.get("OPENAI_TRANSCRIPTION_URL") ?? "https://api.openai.com/v1/audio/transcriptions";
const openAiTranscriptionModel =
  Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") ?? "gpt-4o-mini-transcribe";
const interhumanApiKey = Deno.env.get("INTERHUMAN_API_KEY");
const interhumanAnalyzeUrl =
  Deno.env.get("INTERHUMAN_ANALYZE_URL") ?? "https://api.interhuman.ai/v1/upload/analyze";

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

function isIntentId(intent: unknown): intent is IntentId {
  return (
    intent === "check_in" ||
    intent === "lost_item" ||
    intent === "charger_request" ||
    intent === "demo_schedule"
  );
}

async function resolveIntent(payload: IntentPayload): Promise<IntentReply> {
  const message = await getUserMessage(payload);
  const expectedAction = isIntentId(payload.intent) ? robotActions[payload.intent] : undefined;
  const sourceContext = await getSourceContexts(payload.intent);
  const interhumanContext = await getInterhumanContext(payload.media_base64, payload.media_mime_type);
  const conversation = getConversationTurns(payload.conversation);
  const decision = await generateDecision({
    intent: payload.intent,
    message,
    conversation,
    robot_action: expectedAction ?? "look_around",
    expected_robot_action: expectedAction,
    source_context: sourceContext,
    interhuman_context: interhumanContext
  });
  const audio = await generateSpeech(decision.reply);

  return {
    reply: decision.reply,
    robot_action: decision.robot_action,
    audio_base64: audio.audio_base64,
    audio_mime_type: audio.audio_mime_type,
    user_message: message,
    interhuman_summary: summarizeInterhumanContext(interhumanContext)
  };
}

async function getUserMessage(payload: IntentPayload): Promise<string | undefined> {
  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message.trim();
  }

  if (typeof payload.audio_base64 === "string" && payload.audio_base64.length > 0) {
    return await transcribeAudio(
      payload.audio_base64,
      typeof payload.audio_mime_type === "string" ? payload.audio_mime_type : "audio/webm"
    );
  }

  return undefined;
}

async function getSourceContexts(intent: unknown): Promise<IntentContext[]> {
  if (isIntentId(intent)) {
    return [await getSourceContext(sourceConfigs[intent])];
  }

  return await Promise.all([
    getSourceContext({
      source_key: "luma_event",
      env_name: "LUMA_EVENT_URL",
      default_url: sourceConfigs.demo_schedule.default_url,
      prompt:
        "Extract factual event information useful for answering visitor questions: title, venue, schedule, agenda, hosts, speakers, sponsors, demo timing, check-in, food, and other visible public details.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          venue: { type: "string" },
          schedule: { type: "array", items: { type: "string" } },
          people: { type: "array", items: { type: "string" } },
          visitor_details: { type: "array", items: { type: "string" } }
        }
      }
    }),
    getSourceContext({
      source_key: "talent_garden",
      env_name: "TALENT_GARDEN_URL",
      default_url: sourceConfigs.lost_item.default_url,
      prompt:
        "Extract factual venue information useful for answering visitor questions: address, reception, rooms, amenities, contact/help point, transportation, accessibility, and any visible public visitor guidance.",
      schema: {
        type: "object",
        properties: {
          address: { type: "string" },
          reception: { type: "string" },
          amenities: { type: "array", items: { type: "string" } },
          visitor_guidance: { type: "array", items: { type: "string" } },
          contact_or_help_point: { type: "string" }
        }
      }
    })
  ]);
}

async function getSourceContext(config: SourceConfig): Promise<IntentContext> {
  const sourceUrl = Deno.env.get(config.env_name) ?? config.default_url;
  const cacheKey = `${config.source_key}:${sourceUrl}:${config.prompt}`;
  const cached = contextCache.get(cacheKey);

  if (cached && cached.expires_at > Date.now()) {
    return cached.context;
  }

  const context = await extractContext(config, sourceUrl);
  contextCache.set(cacheKey, {
    expires_at: Date.now() + contextCacheTtlMs,
    context
  });

  return context;
}

async function extractContext(config: SourceConfig, sourceUrl: string): Promise<IntentContext> {
  if (!scrapeGraphApiKey) {
    return {
      status: "skipped",
      source_key: config.source_key,
      source_url: sourceUrl,
      data: {},
      error: "SGAI_API_KEY or SCRAPEGRAPH_API_KEY is not configured"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scrapeGraphTimeoutMs);

  try {
    const response = await fetch(scrapeGraphApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "SGAI-APIKEY": scrapeGraphApiKey
      },
      body: JSON.stringify({
        url: sourceUrl,
        prompt: config.prompt,
        schema: config.schema,
        mode: "reader"
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.error("ScrapeGraph extraction failed", response.status, config.source_key);
      return failedContext(config, sourceUrl, `ScrapeGraph returned ${response.status}`);
    }

    const result = (await response.json().catch(() => undefined)) as
      | { json?: unknown }
      | undefined;

    return {
      status: "extracted",
      source_key: config.source_key,
      source_url: sourceUrl,
      data: asRecord(result?.json)
    };
  } catch (error) {
    console.error("ScrapeGraph request failed", config.source_key, error);
    return failedContext(config, sourceUrl, error instanceof Error ? error.message : "unknown error");
  } finally {
    clearTimeout(timeout);
  }
}

function failedContext(config: SourceConfig, sourceUrl: string, error: string): IntentContext {
  return {
    status: "failed",
    source_key: config.source_key,
    source_url: sourceUrl,
    data: {},
    error
  };
}

async function getInterhumanContext(
  mediaBase64Input: unknown,
  mediaMimeTypeInput: unknown
): Promise<InterhumanContext> {
  if (!interhumanApiKey) {
    throw new Error("Interhuman analysis is not configured.");
  }

  if (typeof mediaBase64Input !== "string" || mediaBase64Input.length === 0) {
    throw new Error("Interhuman media is required.");
  }

  try {
    const mediaMimeType =
      typeof mediaMimeTypeInput === "string" && mediaMimeTypeInput.length > 0
        ? mediaMimeTypeInput
        : "video/webm";
    const form = new FormData();
    form.append("file", new Blob([base64ToArrayBuffer(mediaBase64Input)], { type: mediaMimeType }), "interaction.webm");
    form.append("include[]", "conversation_quality_overall");
    form.append("include[]", "conversation_quality_timeline");

    const response = await fetch(interhumanAnalyzeUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${interhumanApiKey}`
      },
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("Interhuman analysis failed", response.status, errorText);
      throw new Error(`Interhuman analysis failed with ${response.status}.`);
    }

    const data = asRecord(await response.json().catch(() => undefined));
    if (Object.keys(data).length === 0) {
      console.error("Interhuman analysis failed", response.status);
      throw new Error("Interhuman analysis returned no data.");
    }

    return {
      status: "analyzed",
      data
    };
  } catch (error) {
    console.error("Interhuman request failed", error);
    throw error;
  }
}

function summarizeInterhumanContext(context: InterhumanContext): InterhumanSummary {
  const signals = getInterhumanSignals(context.data.signals);
  const primarySignal = [...signals].sort((left, right) => {
    const probabilityDelta =
      probabilityRank(right.probability) - probabilityRank(left.probability);

    if (probabilityDelta !== 0) {
      return probabilityDelta;
    }

    return signalDuration(right) - signalDuration(left);
  })[0];
  const engagementState = getLatestEngagementState(context.data.engagement_state);
  const qualityIndex = asRecord(asRecord(context.data.conversation_quality).overall)
    .quality_index;

  return {
    status: context.status,
    ...(primarySignal ? { primary_signal: primarySignal } : {}),
    ...(engagementState ? { engagement_state: engagementState } : {}),
    ...(typeof qualityIndex === "number" ? { quality_index: qualityIndex } : {})
  };
}

function getInterhumanSignals(value: unknown): InterhumanSignalSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): InterhumanSignalSummary[] => {
    const signal = asRecord(item);

    if (typeof signal.type !== "string" || signal.type.length === 0) {
      return [];
    }

    return [
      {
        type: signal.type,
        ...(typeof signal.probability === "string"
          ? { probability: signal.probability }
          : {}),
        ...(typeof signal.rationale === "string" ? { rationale: signal.rationale } : {}),
        ...(typeof signal.start === "number" ? { start: signal.start } : {}),
        ...(typeof signal.end === "number" ? { end: signal.end } : {})
      }
    ];
  });
}

function getLatestEngagementState(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const states = value.flatMap((item): Array<{ state: string; end: number }> => {
    const entry = asRecord(item);

    if (typeof entry.state !== "string" || entry.state.length === 0) {
      return [];
    }

    return [
      {
        state: entry.state,
        end: typeof entry.end === "number" ? entry.end : 0
      }
    ];
  });

  return [...states].sort((left, right) => right.end - left.end)[0]?.state;
}

function probabilityRank(value: string | undefined): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function signalDuration(signal: InterhumanSignalSummary): number {
  if (typeof signal.start !== "number" || typeof signal.end !== "number") {
    return 0;
  }

  return signal.end - signal.start;
}

async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  if (!openAiApiKey) {
    throw new Error("OpenAI transcription is not configured.");
  }

  const form = new FormData();
  form.append("model", openAiTranscriptionModel);
  form.append("file", new Blob([base64ToArrayBuffer(audioBase64)], { type: mimeType }), "speech.webm");

  const response = await fetch(openAiTranscriptionUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiApiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenAI transcription failed", response.status, errorText);
    throw new Error(`OpenAI transcription failed with ${response.status}.`);
  }

  const result = (await response.json().catch(() => undefined)) as
    | { text?: unknown }
    | undefined;
  const transcript = typeof result?.text === "string" ? result.text.trim() : "";

  if (!transcript) {
    throw new Error("OpenAI transcription returned no text.");
  }

  return transcript;
}

async function generateDecision(context: ReplyContext): Promise<OpenAiDecision> {
  if (!openAiApiKey) {
    throw new Error("OpenAI reply generation is not configured.");
  }

  const response = await fetch(openAiResponsesUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openAiResponseModel,
      instructions: [
        "You are OpsBot, a physical front-desk robot.",
        "Generate the exact words OpsBot should speak out loud and choose one robot action.",
        "Do not use a fixed template.",
        "Do not invent event facts, venue facts, people, times, or scraped details that are not present in the provided context.",
        "If a provider is skipped or failed, keep the answer useful without claiming external facts.",
        "If asked whether people are nearby, only answer from Interhuman signals. If no Interhuman signal exists, say you cannot confirm from the current sensors.",
        "Choose robot_action from both the user's words and Interhuman reaction signals.",
        "For quick button intents, prefer expected_robot_action unless the user clearly says something else.",
        "For open conversation: choose a point action for directions, wave for greetings or positive engagement, look_around for confusion, uncertainty, low conversation quality, people-nearby questions, or when OpsBot should appear to search and pay attention, and idle only when no motion is appropriate.",
        "Sound like you noticed the person and understood the request.",
        "Keep the reply natural, direct, and short enough for speech: one or two sentences."
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(context)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "opsbot_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reply: { type: "string" },
              robot_action: {
                type: "string",
                enum: [
                  "point_checkin",
                  "point_lost_found",
                  "point_charger",
                  "point_demo_queue",
                  "look_around",
                  "wave",
                  "idle"
                ]
              }
            },
            required: ["reply", "robot_action"],
            additionalProperties: false
          }
        }
      },
      max_output_tokens: 120
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenAI reply generation failed", response.status, errorText);
    throw new Error(`OpenAI reply generation failed with ${response.status}.`);
  }

  const result = (await response.json()) as Record<string, unknown>;
  const parsed = parseDecision(extractOutputText(result).trim());

  if (!parsed.reply) {
    throw new Error("OpenAI reply generation returned no text.");
  }

  return parsed;
}

async function generateSpeech(
  reply: string
): Promise<{ audio_base64: string; audio_mime_type: string }> {
  if (!openAiApiKey) {
    throw new Error("OpenAI speech generation is not configured.");
  }

  const response = await fetch(openAiSpeechUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openAiTtsModel,
      voice: openAiTtsVoice,
      input: reply,
      response_format: openAiTtsFormat,
      instructions: "Speak like a calm, attentive front-desk robot that has understood the person."
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenAI speech generation failed", response.status, errorText);
    throw new Error(`OpenAI speech generation failed with ${response.status}.`);
  }

  return {
    audio_base64: arrayBufferToBase64(await response.arrayBuffer()),
    audio_mime_type: audioMimeType(openAiTtsFormat)
  };
}

function extractOutputText(result: Record<string, unknown>): string {
  if (typeof result.output_text === "string") {
    return result.output_text;
  }

  const output = Array.isArray(result.output) ? result.output : [];
  return output
    .flatMap((item) => {
      const content = asRecord(item).content;
      return Array.isArray(content) ? content : [];
    })
    .map((contentItem) => {
      const item = asRecord(contentItem);
      return item.type === "output_text" && typeof item.text === "string" ? item.text : "";
    })
    .join("");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getConversationTurns(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ConversationTurn[] => {
    const record = asRecord(item);
    const role = record.role;
    const content = record.content;

    if ((role === "user" || role === "assistant") && typeof content === "string") {
      return [{ role, content: content.slice(0, 500) }];
    }

    return [];
  }).slice(-8);
}

function parseDecision(value: string): OpenAiDecision {
  const parsed = JSON.parse(value) as Partial<OpenAiDecision>;
  const robotAction = parsed.robot_action;

  if (typeof parsed.reply !== "string" || !isRobotAction(robotAction)) {
    throw new Error("OpenAI reply generation returned an invalid decision.");
  }

  return {
    reply: parsed.reply.trim(),
    robot_action: robotAction
  };
}

function isRobotAction(value: unknown): value is RobotAction {
  return (
    value === "point_checkin" ||
    value === "point_lost_found" ||
    value === "point_charger" ||
    value === "point_demo_queue" ||
    value === "look_around" ||
    value === "wave" ||
    value === "idle"
  );
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function audioMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    pcm: "audio/pcm"
  };

  return mimeTypes[format] ?? "audio/mpeg";
}

function getLoggedIntent(intent: unknown, message: unknown): string {
  if (typeof intent === "string" && intent.length > 0) {
    return intent;
  }

  if (typeof message === "string" && message.trim().length > 0) {
    return "general";
  }

  return "unknown";
}

async function sendRobotAction(action: RobotAction): Promise<RobotStatus> {
  if (!robotBridgeUrl || action === "idle") {
    return "skipped";
  }

  const url = robotBridgeUrl.endsWith("/action")
    ? robotBridgeUrl
    : new URL("action", robotBridgeUrl.endsWith("/") ? robotBridgeUrl : `${robotBridgeUrl}/`)
        .toString();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      console.error("Robot bridge rejected action", response.status);
      return "failed";
    }

    const bridgeResponse = (await response.json().catch(() => undefined)) as
      | { ok?: unknown }
      | undefined;

    return bridgeResponse?.ok === true ? "sent" : "failed";
  } catch (error) {
    console.error("Robot bridge request failed", error);
    return "failed";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Intent processing failed.";
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

  let payload: IntentPayload = {};

  try {
    payload = (await request.json()) as IntentPayload;
  } catch {
    payload = {};
  }

  let response: IntentReply;

  try {
    response = await resolveIntent(payload);
  } catch (error) {
    console.error("Intent resolution failed", error);
    return Response.json(
      { error: errorMessage(error) },
      { status: 500, headers: corsHeaders }
    );
  }

  if (!supabaseAdmin) {
    return Response.json(
      { error: "Intent logging is not configured." },
      { status: 500, headers: corsHeaders }
    );
  }

  const { data: logRow, error } = await supabaseAdmin
    .from("intent_logs")
    .insert({
      intent: getLoggedIntent(payload.intent, payload.message ?? payload.audio_base64),
      reply: response.reply,
      robot_action: response.robot_action,
      robot_status: "skipped"
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { error: "Intent logging failed." },
      { status: 500, headers: corsHeaders }
    );
  }

  if (!logRow) {
    return Response.json(
      { error: "Intent logging did not return a row." },
      { status: 500, headers: corsHeaders }
    );
  }

  const robotStatus = await sendRobotAction(response.robot_action);
  const { error: robotStatusError } = await supabaseAdmin
    .from("intent_logs")
    .update({ robot_status: robotStatus })
    .eq("id", logRow.id);

  if (robotStatusError) {
    return Response.json(
      { error: "Robot status logging failed." },
      { status: 500, headers: corsHeaders }
    );
  }

  const responseWithRobotStatus: IntentResponse = {
    ...response,
    robot_status: robotStatus
  };

  return Response.json(responseWithRobotStatus, {
    headers: corsHeaders
  });
});
