# Intent Function

Mocked Supabase Edge Function for the first OpsBot vertical slice.

Request:

```json
{
  "intent": "demo_schedule"
}
```

Response:

```json
{
  "reply": "Code freeze is at 17:00 and live demos start at 17:30.",
  "robot_action": "point_demo_queue"
}
```

The Next.js app currently uses a matching local `/intent` route so the basic loop works without Supabase credentials.
