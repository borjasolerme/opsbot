# OpsBot Architecture

OpsBot is a fixed-table AI front desk for coworkings and events. Visitors interact from any phone browser through a web app that acts as the robot face, speaker, and UI.

## System Shape

```txt
Phone web app
  -> Next.js app
  -> Supabase Edge Function /intent
  -> Supabase Postgres logs
  -> Mock robot action
  -> Cyberwave robot integration later
```

## Integration Notes

- ScrapeGraph extracts event and schedule information.
- Interhuman adds realtime empathy and social-signal analysis.
- Cyberwave connects mocked robot actions to one selected robot: UGV Beast Rover or Unitree Go2.
- Supabase hosts Edge Functions and Postgres logs.
- The current hackathon slice keeps the Next.js app at the repo root and calls the local Supabase Edge Function at `http://127.0.0.1:54331/functions/v1/intent`.

## Constraints

- Fixed table only.
- Robot does not move between rooms.
- Any phone can be the robot face/speaker/UI through the web app.
- Robot hardware action is mocked first.
- No Python/FastAPI backend for the MVP.
