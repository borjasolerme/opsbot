import { describe, expect, it } from "vitest";
import { resolveIntent } from "./intent";

describe("resolveIntent", () => {
  it("returns the mocked demo schedule reply and robot action", () => {
    expect(resolveIntent("demo_schedule")).toEqual({
      reply: "Code freeze is at 17:00 and live demos start at 17:30.",
      robot_action: "point_demo_queue"
    });
  });

  it("falls back to idle for unknown intents", () => {
    expect(resolveIntent("unknown")).toEqual({
      reply: "I can help with check-in, lost items, chargers, or the demo schedule.",
      robot_action: "idle"
    });
  });
});
