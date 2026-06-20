# Intent Function

Supabase Edge Function for the OpsBot voice and robot loop.

The function uses one shared pipeline for shortcut buttons and open voice conversation:

```txt
request media + intent/message
↓
ScrapeGraph context
↓
Interhuman upload/analyze
↓
OpenAI decision + speech
↓
Supabase log
↓
Cyberwave robot bridge
```

Shortcut request:

```json
{
  "intent": "demo_schedule",
  "media_base64": "<webm-base64>",
  "media_mime_type": "video/webm"
}
```

Voice request:

```json
{
  "audio_base64": "<webm-base64>",
  "audio_mime_type": "video/webm",
  "media_base64": "<webm-base64>",
  "media_mime_type": "video/webm",
  "conversation": []
}
```

Response:

```json
{
  "reply": "<OpenAI-generated text>",
  "robot_action": "look_around",
  "robot_status": "sent",
  "audio_base64": "<mp3-base64>",
  "audio_mime_type": "audio/mpeg",
  "user_message": "<OpenAI transcript when available>"
}
```

Run locally:

```bash
npm run dev:intent
```

Local endpoint:

```txt
http://127.0.0.1:54331/functions/v1/intent
```

## Required Providers

OpenAI is required for transcription, reply/action selection, and speech audio:

```bash
OPENAI_API_KEY=
OPENAI_RESPONSE_MODEL=gpt-4.1-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral
OPENAI_TTS_FORMAT=mp3
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Interhuman is required. The function sends the request media to `POST /v1/upload/analyze` as multipart form data and requests only `conversation_quality_overall` to keep the response lighter.

Interhuman also documents `WSS /v1/stream/analyze`, but the current Supabase/Deno route keeps upload/analyze because streaming authentication requires a header-capable WebSocket client or proxy.

```bash
INTERHUMAN_API_KEY=
INTERHUMAN_ANALYZE_URL=https://api.interhuman.ai/v1/upload/analyze
```

ScrapeGraph supplies event and venue context. `SCRAPEGRAPH_API_KEY` is the preferred env name; `SGAI_API_KEY` remains supported in code for older local envs.

```bash
SCRAPEGRAPH_API_KEY=
SCRAPEGRAPH_EXTRACT_URL=https://v2-api.scrapegraphai.com/api/extract
SCRAPEGRAPH_TIMEOUT_MS=4000
SCRAPEGRAPH_CONTEXT_CACHE_TTL_MS=300000
LUMA_EVENT_URL=https://luma.com/mmc68m0b?tk=O68Z91
TALENT_GARDEN_URL=https://talentgarden.com/it/coworking/milano-calabiana
```

## Logs

Each row stores:

```sql
select intent, reply, robot_action, robot_status, created_at
from public.intent_logs
order by created_at desc
limit 1;
```
