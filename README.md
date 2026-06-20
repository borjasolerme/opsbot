# OpsBot

## One-liner

OpsBot is a physical AI front desk for coworkings and events: it reads live event info, talks to visitors through an iPhone interface, and triggers simple robot actions like pointing to check-in, lost-and-found, charger help, or demo queue.

## Project

OpsBot is a fixed-table AI front desk for coworkings and events. Visitors interact through an iPhone. The system answers questions, reads event info, logs actions, and later triggers simple robot actions like pointing, waving, or pushing a card.

## Tracks

- Cyberwave
- ScrapeGraph AI
- Interhuman AI

## Stack

- Frontend: Next.js + TypeScript
- Backend: Supabase Edge Functions
- Database/logs: Supabase Postgres
- UI/audio: iPhone Safari + browser speech synthesis
- ScrapeGraph: event/schedule extraction
- Interhuman: realtime empathy/social-signal layer
- Cyberwave: robot/arm/servo/camera integration

This repo intentionally does not include a Python/FastAPI backend.

## MVP Flow

```txt
Visitor taps button on iPhone
↓
Next.js calls Supabase Edge Function /intent
↓
Function returns reply + robot_action
↓
iPhone speaks the reply
↓
Action is logged in Supabase
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

## Important Constraints

- Fixed table only.
- Robot does not move between rooms.
- iPhone is the robot face/speaker/UI.
- Robot hardware action is mocked first.
- Do not implement the app yet; create only repo structure and README files.

## Partner Docs

### Cyberwave

- Platform signup: https://cyberwave.com/signup?code=hackathon-builder
- Docs: https://docs.cyberwave.com
- Quickstart: https://docs.cyberwave.com/overview
- SO101 robot arm: https://docs.cyberwave.com/hardware/so101
- UGV Beast Rover: https://docs.cyberwave.com/hardware/ugv/index
- Unitree Go2 dog robot: https://docs.cyberwave.com/hardware/go2/index
- Camera integration: https://docs.cyberwave.com/hardware/camera/index

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

  frontend/
    README.md
    app/
    components/
    lib/

  supabase/
    README.md
    functions/
      intent/
    migrations/

  docs/
    architecture.md
    demo-script.md
    partner-docs.md
```
