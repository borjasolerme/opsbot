# OpsBot

## One-liner

OpsBot is a physical AI front desk for coworkings and events: it reads live event info, talks to visitors through a phone web app, and triggers simple robot actions like pointing to check-in, lost-and-found, charger help, or demo queue.

## Project

OpsBot is a voice-first AI front desk for coworkings and events. Visitors interact from any phone browser through a web app. The system answers questions, reads event and venue info, analyzes the interaction with Interhuman, logs actions, and triggers Cyberwave robot motion.

## How to Start

From the repo root:

```bash
cd opsbot
npm install
cp .env.example .env.local
```

Fill `.env.local` with the Supabase, ScrapeGraph, Interhuman, Cyberwave, and OpenAI keys needed for your local run.
Use `OPSBOT_SUPABASE_SERVICE_ROLE_KEY` for the local service role key; Supabase local serve ignores env names that start with `SUPABASE_`.

Start the local Supabase Edge Function:

```bash
npm run dev:intent
```

In a second terminal, start the robot bridge:

```bash
cd opsbot
python3 -m venv .venv
source .venv/bin/activate
pip install -r robot_bridge/requirements.txt
npm run dev:robot
```

In a third terminal, start the Next.js app:

```bash
cd opsbot
npm run dev
```

Open:

```txt
http://localhost:3000
```

Useful checks:

```bash
npm test
npm run test:robot
npm run build
```

## Stack

- App: Next.js + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Supabase Edge Functions
- Database/logs: Supabase Postgres
- UI/audio: phone web app + OpenAI speech playback
- OpenAI: natural reply generation, voice transcription, and speech audio
- ScrapeGraph: event and venue context extraction
- Interhuman: required video/audio social-signal analysis
- Cyberwave: one selected robot target, either UGV Beast Rover or Unitree Go2

## MVP Flow

```txt
Visitor taps a shortcut or Talk on the phone web app
↓
The browser captures a short camera/mic clip
↓
Next.js calls the Supabase Edge Function /intent
↓
Function runs transcription, ScrapeGraph, and Interhuman in parallel, then calls OpenAI
↓
Function returns OpenAI reply audio + robot_action
↓
The phone web app plays OpenAI speech
↓
Next.js calls /api/robot-action after speech playback
↓
The Python bridge moves the Cyberwave robot and updates robot_status
```

## MVP Buttons

- Check-in
- Lost item
- Charger request
- Demo schedule
- Talk

## Example Response

```json
{
  "reply": "<OpenAI-generated speech text>",
  "robot_action": "point_demo_queue",
  "robot_status": "skipped",
  "intent_log_id": "<supabase-log-row-id>",
  "audio_base64": "<mp3-base64>",
  "audio_mime_type": "audio/mpeg"
}
```

## Example Robot Actions

- point_checkin
- point_lost_found
- point_charger
- point_demo_queue
- look_around
- wave
- idle

## Current Vertical Slice

The local vertical slice uses the Supabase Edge Function and the Python robot bridge:

```txt
iPhone web app shortcut or Talk button
↓
Supabase Edge Function /intent
↓
Supabase log
↓
Robot bridge
↓
Cyberwave
↓
selected robot
```

The web app renders the robot state from the Edge Function response and plays the OpenAI-generated audio. Cyberwave code remains isolated in the Python bridge.

## ScrapeGraph Context Layer

The intent function resolves context before generating replies:

```txt
shortcut intent or spoken request
↓
ScrapeGraph source selection
↓
ScrapeGraph structured extraction
↓
Interhuman media analysis
↓
OpenAI reply/action/audio generation
↓
Supabase log
↓
robot bridge
```

Shortcuts scrape only the relevant source. The general Talk path uses both the event page and the venue page.

| Intent | Source env | Default source | Extracted object |
| --- | --- | --- | --- |
| `check_in` | `LUMA_EVENT_URL` | Luma event page | event title, venue, start time, check-in/start instructions |
| `lost_item` | `TALENT_GARDEN_URL` | Talent Garden Calabiana page | venue address, reception/front desk/contact/help point |
| `charger_request` | `LUMA_EVENT_URL` | Luma event page | public Cyberwave people, speakers, hosts, or organizers |
| `demo_schedule` | `LUMA_EVENT_URL` | Luma event page | agenda, demo time, code freeze, schedule |

ScrapeGraph uses the v2 extract endpoint documented by ScrapeGraph:

```txt
POST https://v2-api.scrapegraphai.com/api/extract
Header: SGAI-APIKEY
Body: { url, prompt, schema, mode: "reader" }
```

There is no deterministic visitor reply fallback. If ScrapeGraph is unavailable, the Edge Function passes that provider status to OpenAI. OpenAI is instructed not to invent scraped facts.

## Interhuman Context Layer

Interhuman is required for `/intent`. The browser sends a short WebM camera/mic clip for every shortcut and Talk request. The Edge Function uploads that clip to Interhuman with the lighter overall-only conversation quality include:

```txt
POST https://api.interhuman.ai/v1/upload/analyze
Header: Authorization: Bearer <INTERHUMAN_API_KEY>
Body: multipart/form-data file=<webm>, include[]=conversation_quality_overall
```

Interhuman also documents a faster `WSS /v1/stream/analyze` route. The current Supabase/Deno route keeps upload/analyze because Interhuman streaming authentication requires a header-capable WebSocket client or proxy, while Deno's native client cannot set the required `Authorization` header.

The Interhuman response is passed to OpenAI as context. If Interhuman credentials are missing or the upload fails, `/intent` returns an error instead of pretending the robot can see people.

Required server env:

```bash
INTERHUMAN_API_KEY=
INTERHUMAN_ANALYZE_URL=https://api.interhuman.ai/v1/upload/analyze
```

## OpenAI Speech Layer

OpenAI does three jobs in the Edge Function:

- transcribes Talk recordings when the request contains voice
- chooses the natural reply and robot action from ScrapeGraph and Interhuman context
- generates the speech audio returned to the browser

Required server env:

```bash
OPENAI_API_KEY=
OPENAI_RESPONSE_MODEL=gpt-4.1-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral
OPENAI_TTS_FORMAT=mp3
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

## Robot Bridge

The robot bridge is a small Python HTTP service in `robot_bridge/`.

It receives an OpsBot robot action, maps it to Cyberwave behavior, and returns `sent` after Cyberwave accepts the initial SDK position update. Rotation, camera, and drive gestures continue inside the bridge process so the Supabase Edge Function does not hit its wall-clock limit. Cyberwave SDK code only lives in `robot_bridge/cyberwave_adapter.py`.

Run it locally:

```bash
cd opsbot
python3 -m venv .venv
source .venv/bin/activate
pip install -r robot_bridge/requirements.txt
python -m robot_bridge.server
```

It waits for the Cyberwave adapter to apply the first visible Cyberwave position update before returning `robot_status: "sent"`, so `sent` means Cyberwave accepted the action, not just that the HTTP request reached the bridge.

Send a test action:

```bash
curl -X POST http://127.0.0.1:8765/action \
  -H "Content-Type: application/json" \
  -d '{"action":"point_demo_queue"}'
```

Expected response:

```json
{ "ok": true, "action": "point_demo_queue", "robot_status": "sent" }
```

Bypass Next.js and Supabase entirely when debugging Cyberwave:

```bash
npm run robot:send -- point_lost_found
```

That command sends directly through the Cyberwave SDK and prints the stored twin pose after the action.

Bridge configuration:

```bash
export CYBERWAVE_API_KEY="cw_your_token"
export CYBERWAVE_WORKSPACE="borjas-workspace"
export CYBERWAVE_ENVIRONMENT_ID="075f2258-8e0f-4ce3-9e91-c00cb387cca8"
export CYBERWAVE_ROBOT_REGISTRY_ID="waveshare/ugv-beast"
export CYBERWAVE_ROBOT_ID="8599efec-fe5b-47ea-8040-78cd9e531d9a"
export ROBOT_MODE="simulation"
export CYBERWAVE_AFFECT="simulation"
export CYBERWAVE_SIMULATION_VISIBILITY_MODE="scene_edit"
export CYBERWAVE_SCENE_POSITION_STEPS="12"
export CYBERWAVE_SCENE_POSITION_STEP_DELAY="0.06"
export CYBERWAVE_CAMERA_JOINT_STEPS="4"
export CYBERWAVE_CAMERA_JOINT_STEP_DELAY="0.04"
export ROBOT_FREE_ROAM="1"
export ROBOT_FREE_ROAM_STEPS="3"
export ROBOT_FREE_ROAM_RADIUS="0.42"
export CYBERWAVE_WORKFLOW_POINT_CHECKIN="887173ea-eb5c-4d70-84d2-9178c6d3205a"
export CYBERWAVE_WORKFLOW_TRIGGER_POINT_CHECKIN="5644d337-8e95-40cc-be34-c2ac6c33c8c3"
export CYBERWAVE_WORKFLOW_POINT_LOST_FOUND="d0ec2fe3-213a-4183-a4eb-5e517476163d"
export CYBERWAVE_WORKFLOW_TRIGGER_POINT_LOST_FOUND="07171aca-7596-4883-8237-870415aef3a5"
export CYBERWAVE_WORKFLOW_POINT_CHARGER="e0913288-261f-46c4-9980-bfd3e84b167a"
export CYBERWAVE_WORKFLOW_TRIGGER_POINT_CHARGER="3e0cdbbd-be3f-4cbb-a5ff-aefbd3af4a3e"
export CYBERWAVE_WORKFLOW_POINT_DEMO_QUEUE="b171a1f3-672e-4f39-812f-f6b1f29ff795"
export CYBERWAVE_WORKFLOW_TRIGGER_POINT_DEMO_QUEUE="5b48f1c8-e3d0-468c-9e84-da14b5fd4585"
export CYBERWAVE_WORKFLOW_LOOK_AROUND="01fd77e5-612c-4bdb-9428-af9b3aa4d503"
export CYBERWAVE_WORKFLOW_TRIGGER_LOOK_AROUND="ed29d974-247f-4035-ba97-bdb9723703d2"
export CYBERWAVE_WORKFLOW_STRICT="0"
```

If `CYBERWAVE_ROBOT_ID` is not set, the adapter falls back to `CYBERWAVE_ROBOT_REGISTRY_ID` (`waveshare/ugv-beast` by default) and `CYBERWAVE_ENVIRONMENT_ID`.

Use `ROBOT_MODE=simulation` while the Cyberwave environment is in Simulate mode. Switch it to `live` only when controlling the physical robot. `CYBERWAVE_AFFECT` remains as a backward-compatible fallback.

Each bridge action logs the mode and action:

```txt
Robot mode: simulation
Action sent: point_demo_queue
```

`CYBERWAVE_SIMULATION_VISIBILITY_MODE=scene_edit` also updates the UGV Beast scene pose through Cyberwave REST after publishing the MQTT movement command. This gives the hackathon demo a visible SDK-driven movement path even if the Cyberwave simulation panel says there is no active simulation runtime.

The bridge uses both Cyberwave paths. It triggers the Cyberwave workflow with its explicit trigger node UUID so runs appear in the Cyberwave `Executions` tab, then it also sends the SDK scene pose, UGV Beast wheel commands, and UGV Beast camera/head commands for the visible demo movement. Workflow failures are logged but non-fatal while `CYBERWAVE_WORKFLOW_STRICT=0`.

The Cyberwave control surface for this environment reports the UGV Beast as a mobile base with `locomotion` and `camera` capabilities. The bridge publishes the UGV Beast catalog camera commands (`camera_left`, `camera_right`, `camera_up`, `camera_down`, `camera_default`) and also sends direct pan/tilt joint updates for `pt_base_link_to_pt_link1` and `pt_link1_to_pt_link2` so the head is visible in the Cyberwave viewport.

The scene position path is intentionally smoothed. `CYBERWAVE_SCENE_POSITION_STEPS` and `CYBERWAVE_SCENE_POSITION_STEP_DELAY` make the stored twin pose move in small increments instead of jumping from one waypoint to another. This is only a demo visibility path; the SDK still sends the UGV Beast wheel commands through Cyberwave.

`ROBOT_FREE_ROAM=1` lets the bridge add a few autonomous-looking scene movements after the destination action. It chooses small random offsets inside the demo rectangle (`x=-2.2..2.2`, `y=-1.5..1.5`) so the robot can look like it is thinking and repositioning without leaving the front-desk area. Free roam runs only in simulation by default; do not enable it for live hardware unless the physical robot safety boundary is confirmed.

Current UGV Beast action mapping:

| OpsBot action | Cyberwave commands |
| --- | --- |
| `point_checkin` | stop, scan left/right with camera, small forward move, gentle `turn_left`, `camera_left`, `camera_up`, scene pose `x=-2.0 y=1.4 yaw=-18` |
| `point_lost_found` | stop, scan left/right with camera, small forward move, gentle `turn_right`, `camera_right`, `camera_up`, scene pose `x=2.0 y=1.4 yaw=18` |
| `point_charger` | stop, scan left/right with camera, small forward move, gentle `turn_left`, `camera_left`, `camera_down`, scene pose `x=-2.0 y=-1.4 yaw=-30` |
| `point_demo_queue` | stop, scan left/right with camera, small forward move, gentle `turn_right`, `camera_right`, `camera_down`, scene pose `x=2.0 y=-1.4 yaw=30` |
| `look_around` | stop, scan left/right with camera, small left/right/center chassis gesture, scene pose near the center |
| `wave` | stop, center camera, small left/right/center chassis gesture |
| `idle` | `stop` |

If the bridge returns `ok: true` but the Cyberwave viewport does not move:

- Sign back into Cyberwave if the page says your login expired.
- Start the Cyberwave simulation or refresh the Cyberwave editor. External SDK scene edits update the stored twin pose immediately, but the editor viewport may not live-refresh every external edit while it is already open.
- Keep `npm run dev:robot` open and check for `Cyberwave target` and `Cyberwave command` lines.
- Run the direct bridge curl before testing the OpsBot UI.
- Verify the stored Cyberwave pose with `npm run robot:send -- point_charger`; it prints the twin pose after dispatch.

For the local Supabase stack, run the robot bridge in Docker on the same Supabase network. The Edge Function runs inside Docker, so this is more reliable than pointing it at a Mac host process.

```bash
docker run -d \
  --name opsbot_robot_bridge \
  --network supabase_network_opsbot \
  -p 8765:8765 \
  --env-file .env.local \
  -e ROBOT_BRIDGE_HOST=0.0.0.0 \
  -e ROBOT_BRIDGE_PORT=8765 \
  -v "$PWD:/app" \
  -w /app \
  python:3.12-slim \
  sh -lc 'pip install --no-cache-dir -r robot_bridge/requirements.txt >/tmp/opsbot-pip.log 2>&1 && exec uvicorn robot_bridge.server:app --host 0.0.0.0 --port 8765 --log-level info'
```

The first Docker start can take a minute because the Cyberwave SDK installs `numpy` and related dependencies. Wait for `Uvicorn running on http://0.0.0.0:8765` in `docker logs opsbot_robot_bridge`, then test `http://127.0.0.1:8765/health`.

Then set the Edge Function bridge URL to the Docker service name:

```bash
ROBOT_BRIDGE_URL="http://opsbot_robot_bridge:8765"
NEXT_SERVER_ROBOT_BRIDGE_URL="http://127.0.0.1:8765"
```

`ROBOT_BRIDGE_URL` is for Supabase/Docker. `NEXT_SERVER_ROBOT_BRIDGE_URL` is for the Next.js API route that runs on the host after the speech finishes. Restart `npm run dev:intent` after changing `.env.local`; the Edge runtime only reads env vars at startup.

To prove the demo triggered the robot, query the latest Supabase log row:

```sql
select intent, reply, robot_action, robot_status, created_at
from public.intent_logs
order by created_at desc
limit 1;
```

Useful bridge checks:

```bash
npm run test:robot
```

## Frontend Response

```txt
Function returns
↓
reply + audio_base64 + robot_action + intent_log_id
↓
OpenAI speech audio playback
↓
/api/robot-action dispatches to the Cyberwave bridge
↓
robot_status becomes sent/failed/skipped
```

The Next.js app calls `NEXT_PUBLIC_INTENT_FUNCTION_URL`, which defaults to the local Supabase Functions endpoint.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Next.js app:

```bash
npm run dev
```

In another terminal, start the local Supabase Edge Function:

```bash
npm run dev:intent
```

Open:

```txt
http://localhost:3000
```

The frontend sends intent requests to:

```txt
http://127.0.0.1:54331/functions/v1/intent
```

Useful checks:

```bash
npm test
npm run build
npm audit --omit=dev
```

## UI Stack

- Tailwind CSS v4 for utility-first styling.
- shadcn/ui for the local Button primitive.
- Nice Design tokens are mapped into Tailwind CSS variables in `app/globals.css`.

## Starter Docs

These are starter references for anyone who wants to connect OpsBot to event extraction, realtime social-signal analysis, robot hardware, or Supabase Edge Functions.

### Cyberwave

- Docs: https://docs.cyberwave.com
- Quickstart: https://docs.cyberwave.com/overview
- UGV Beast Rover: https://docs.cyberwave.com/hardware/ugv/index
- Unitree Go2 dog robot: https://docs.cyberwave.com/hardware/go2/index

### ScrapeGraph

- Docs: https://docs.scrapegraphai.com/
- JavaScript SDK: https://docs.scrapegraphai.com/sdks/javascript
- Extract: https://docs.scrapegraphai.com/services/extract

### Interhuman

- Docs: https://docs.interhuman.ai/
- Streaming Analyze API: https://docs.interhuman.ai/api-reference/stream-analyze
- Upload Analyze API: https://docs.interhuman.ai/api-reference/upload-analyze

### Supabase

- Edge Functions: https://supabase.com/docs/guides/functions

## Repo Structure

```txt
opsbot/
  README.md
  .gitignore
  .env.example
  package.json
  next.config.mjs
  postcss.config.mjs
  tsconfig.json

  app/
    page.tsx
  components/
    OpsBotConsole.tsx
    ui/
  lib/
    intent.ts
    utils.ts

  supabase/
    README.md
    functions/
      intent/
    migrations/

  docs/
    architecture.md
    demo-script.md
    starter-docs.md
```
