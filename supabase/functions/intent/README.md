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

Run locally:

```bash
npm run dev:intent
```

Local endpoint:

```txt
http://127.0.0.1:54331/functions/v1/intent
```

The Next.js app calls this endpoint through `NEXT_PUBLIC_INTENT_FUNCTION_URL`.
