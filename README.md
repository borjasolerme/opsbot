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
  "robot_action": "point_demo_queue"
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
