# OpsBot Architecture

OpsBot is a fixed-table AI front desk for coworkings and events. Visitors interact with an iPhone interface that acts as the robot face, speaker, and UI.

## System Shape

```txt
iPhone Safari UI
  -> Next.js frontend
  -> Supabase Edge Function /intent
  -> Supabase Postgres logs
  -> Mock robot action
  -> Cyberwave robot integration later
```

## Partner Roles

- ScrapeGraph extracts event and schedule information.
- Interhuman adds realtime empathy and social-signal analysis.
- Cyberwave connects mocked robot actions to real hardware.
- Supabase hosts Edge Functions and Postgres logs.

## Constraints

- Fixed table only.
- Robot does not move between rooms.
- iPhone is the robot face/speaker/UI.
- Robot hardware action is mocked first.
- No Python/FastAPI backend for the MVP.
