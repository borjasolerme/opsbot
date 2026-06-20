# OpsBot

## One-liner

OpsBot is a physical AI front desk for coworkings and events: it reads live event info, talks to visitors through a phone web app, and triggers simple robot actions like pointing to check-in, lost-and-found, charger help, or demo queue.

## Project

OpsBot is a fixed-table AI front desk for coworkings and events. Visitors interact from any phone browser through a web app. The system answers questions, reads event info, logs actions, and later triggers simple robot actions like pointing, waving, or pushing a card.

## How to Start

From the repo root:

```bash
cd opsbot
npm install
cp .env.example .env.local
```

Fill `.env.local` with the Supabase, ScrapeGraph, Interhuman, Cyberwave, and OpenAI keys needed for your local run.

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
- UI/audio: phone web app + browser speech synthesis
- ScrapeGraph: event/schedule extraction
- Interhuman: realtime empathy/social-signal layer
- Cyberwave: one selected robot target, either UGV Beast Rover or Unitree Go2

## MVP Flow

```txt
Visitor taps button on the phone web app
↓
Next.js calls the Supabase Edge Function /intent
↓
Function returns reply + robot_action
↓
The phone web app speaks the reply
↓
UI shows a mocked robot action
↓
Robot action is mocked first, then connected to Cyberwave
```

## MVP Buttons

- Check-in
- Lost item
- Charger request
- Demo schedule

## Example Response

```json
{
  "reply": "Code freeze is at 17:00 and live demos start at 17:30.",
  "robot_action": "point_demo_queue",
  "robot_status": "sent"
}
```

## Example Robot Actions

- point_checkin
- point_lost_found
- point_charger
- point_demo_queue
- wave
- idle

## Current Vertical Slice

The mocked loop now uses the local Supabase Edge Function:

```txt
iPhone web app button
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

The web app still renders the mocked robot state immediately from the Edge Function response. The real robot path is isolated in the Python bridge.

## Robot Bridge

The robot bridge is a small Python service in `robot_bridge/`.

It receives an OpsBot robot action, maps it to robot behavior, and sends the command to Cyberwave. Cyberwave SDK code only lives in `robot_bridge/cyberwave_adapter.py`.

Run it locally:

```bash
cd opsbot
python3 -m venv .venv
source .venv/bin/activate
pip install -r robot_bridge/requirements.txt
python -m robot_bridge.server
```

Send a test action:

```bash
curl -X POST http://127.0.0.1:8765/action \
  -H "Content-Type: application/json" \
  -d '{"action":"point_demo_queue"}'
```

Expected response:

```json
{ "ok": true, "action": "point_demo_queue" }
```

Bridge configuration:

```bash
export CYBERWAVE_API_KEY="cw_your_token"
export CYBERWAVE_WORKSPACE="borjas-workspace"
export CYBERWAVE_ENVIRONMENT_ID="borjas-workspace/envs/opsbot-hackathon-demo"
export CYBERWAVE_ROBOT_REGISTRY_ID="waveshare/ugv-beast"
export CYBERWAVE_ROBOT_ID="your_twin_uuid_or_slug"
export ROBOT_MODE="simulation"
export CYBERWAVE_AFFECT="simulation"
export CYBERWAVE_SIMULATION_VISIBILITY_MODE="scene_edit"
```

If `CYBERWAVE_ROBOT_ID` is not set, the adapter falls back to `CYBERWAVE_ROBOT_REGISTRY_ID` (`waveshare/ugv-beast` by default) and `CYBERWAVE_ENVIRONMENT_ID`.

Use `ROBOT_MODE=simulation` while the Cyberwave environment is in Simulate mode. Switch it to `live` only when controlling the physical robot. `CYBERWAVE_AFFECT` remains as a backward-compatible fallback.

Each bridge action logs the mode and action:

```txt
Robot mode: simulation
Action sent: point_demo_queue
```

`CYBERWAVE_SIMULATION_VISIBILITY_MODE=scene_edit` also updates the UGV Beast scene rotation through Cyberwave REST after publishing the MQTT movement command. This makes OpsBot actions visible in the Cyberwave viewport even when no mission workflow execution is created.

The Cyberwave MCP control surface for this environment reports the UGV Beast as a mobile base with `locomotion` and `camera` capabilities. Direct joint targets are listed as not currently available for this twin, so the bridge uses small chassis movements plus camera pan/tilt instead of raw wheel or pan/tilt joint commands.

Current UGV Beast action mapping:

| OpsBot action | Cyberwave commands |
| --- | --- |
| `point_checkin` | stop, scan left/right with camera, small forward move, gentle `turn_left`, `camera_left`, `camera_up`, smooth scene yaw `-18` |
| `point_lost_found` | stop, scan left/right with camera, small forward move, gentle `turn_right`, `camera_right`, `camera_up`, smooth scene yaw `18` |
| `point_charger` | stop, scan left/right with camera, small forward move, gentle `turn_left`, `camera_left`, `camera_down`, smooth scene yaw `-30` |
| `point_demo_queue` | stop, scan left/right with camera, small forward move, gentle `turn_right`, `camera_right`, `camera_down`, smooth scene yaw `30` |
| `wave` | stop, center camera, small left/right/center chassis gesture |
| `idle` | `stop` |

If the bridge returns `ok: true` but the Cyberwave viewport does not move:

- Sign back into Cyberwave if the page says your login expired.
- Start the Cyberwave simulation. The right panel should not say `No active simulation`.
- Keep `npm run dev:robot` open and check for `Cyberwave target` and `Cyberwave command` lines.
- Run the direct bridge curl before testing the OpsBot UI.

To connect the Supabase Edge Function to the bridge, set:

```bash
export ROBOT_BRIDGE_URL="http://host.docker.internal:8765"
```

Use `host.docker.internal` for local Supabase because the Edge Function runs inside Docker while the bridge runs on your Mac.
The `npm run dev:intent` script loads `.env.local` so this value is available to the Edge Function.

Bind the bridge to `0.0.0.0` locally so Supabase Docker can reach it:

```bash
export ROBOT_BRIDGE_HOST="0.0.0.0"
```

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
reply + robot_action
↓
browser speech synthesis
↓
mocked robot action UI
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

- Realtime Analyze API: https://interhumanai-realtime.mintlify.app/api-reference/realtime-analyze

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
