import { describe, expect, it } from "vitest";
import { isIntentId, robotActionForIntent } from "./intent";

describe("intent helpers", () => {
  it("maps supported intents to robot actions", () => {
    expect(robotActionForIntent("demo_schedule")).toBe("point_demo_queue");
    expect(robotActionForIntent("lost_item")).toBe("point_lost_found");
  });

  it("treats unknown intents as idle", () => {
    expect(robotActionForIntent("unknown")).toBe("idle");
    expect(isIntentId("unknown")).toBe(false);
  });
});
