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
  "robot_action": "point_demo_queue",
  "robot_status": "sent"
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

If `ROBOT_BRIDGE_URL` is set, the function posts the resolved robot action to the Python robot bridge after the Supabase log insert:

```json
{
  "action": "point_demo_queue"
}
```

The latest log row stores the robot result:

```sql
select intent, reply, robot_action, robot_status, created_at
from public.intent_logs
order by created_at desc
limit 1;
```
