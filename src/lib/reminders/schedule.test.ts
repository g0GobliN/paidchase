import { describe, expect, it } from "vitest";

import { planReminders, stepSendTime, SEND_HOUR_UTC, type ReminderStepLike } from "./schedule";

function step(order: number, offsetDays: number, offsetType = "after_due"): ReminderStepLike {
  return {
    id: `step-${order}`,
    step_order: order,
    offset_days: offsetDays,
    offset_type: offsetType,
    subject: `Subject ${order}`,
    body: `Body ${order}`,
  };
}

/** The seeded "Friendly" sequence: due date, +3 days, +7 days. */
const FRIENDLY = [step(1, 0, "on_due"), step(2, 3), step(3, 7)];

/** The seeded "Standard" sequence: 1 day before, due, +3, +7. */
const STANDARD = [step(1, -1, "before_due"), step(2, 0, "on_due"), step(3, 3), step(4, 7)];

describe("stepSendTime", () => {
  it("sends at 09:00 UTC on the offset day", () => {
    expect(stepSendTime("2026-08-10", 0).toISOString()).toBe("2026-08-10T09:00:00.000Z");
    expect(stepSendTime("2026-08-10", 3).toISOString()).toBe("2026-08-13T09:00:00.000Z");
    expect(stepSendTime("2026-08-10", -1).toISOString()).toBe("2026-08-09T09:00:00.000Z");
    expect(SEND_HOUR_UTC).toBe(9);
  });

  it("rolls across month boundaries", () => {
    expect(stepSendTime("2026-08-30", 7).toISOString()).toBe("2026-09-06T09:00:00.000Z");
  });
});

describe("planReminders — invoice created before it is due", () => {
  it("schedules every step, none marked catch-up", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    const planned = planReminders("2026-08-10", FRIENDLY, now);

    expect(planned).toHaveLength(3);
    expect(planned.map((p) => p.sequence_step)).toEqual([1, 2, 3]);
    expect(planned.some((p) => p.catch_up)).toBe(false);
    expect(planned[0]!.scheduled_at).toBe("2026-08-10T09:00:00.000Z");
    expect(planned[2]!.scheduled_at).toBe("2026-08-17T09:00:00.000Z");
  });
});

describe("planReminders — the overdue-signup case (regression)", () => {
  // This is the bug: an invoice already overdue when it is added used to produce
  // an empty plan, so the highest-intent new user got no reminders at all.

  it("still chases an invoice that is already 5 days overdue", () => {
    const now = new Date("2026-08-15T12:00:00Z"); // due 08-10, so steps 1 and 2 are missed
    const planned = planReminders("2026-08-10", FRIENDLY, now);

    expect(planned.length).toBeGreaterThan(0);
    const catchUp = planned.find((p) => p.catch_up);
    expect(catchUp).toBeDefined();
    expect(catchUp!.scheduled_at).toBe(now.toISOString());
  });

  it("collapses missed steps into exactly one catch-up send", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const planned = planReminders("2026-08-10", FRIENDLY, now);

    expect(planned.filter((p) => p.catch_up)).toHaveLength(1);
  });

  it("uses the most escalated missed step, not the earliest", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const planned = planReminders("2026-08-10", FRIENDLY, now);

    // Steps 1 (due) and 2 (+3) are in the past. Sending "due today" for an
    // invoice already 5 days late would read as broken.
    const catchUp = planned.find((p) => p.catch_up)!;
    expect(catchUp.sequence_step).toBe(2);
    expect(catchUp.step_id).toBe("step-2");
  });

  it("keeps future steps on their real schedule alongside the catch-up", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const planned = planReminders("2026-08-10", FRIENDLY, now);

    const future = planned.filter((p) => !p.catch_up);
    expect(future).toHaveLength(1);
    expect(future[0]!.sequence_step).toBe(3);
    expect(future[0]!.scheduled_at).toBe("2026-08-17T09:00:00.000Z");
  });

  it("sends one final message when the whole sequence has elapsed", () => {
    const now = new Date("2026-09-30T12:00:00Z"); // every Friendly step long past
    const planned = planReminders("2026-08-10", FRIENDLY, now);

    expect(planned).toHaveLength(1);
    expect(planned[0]!.catch_up).toBe(true);
    expect(planned[0]!.sequence_step).toBe(3);
  });

  it("never emits duplicate sequence_step values (unique index safety)", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    for (const seq of [FRIENDLY, STANDARD]) {
      const steps = planReminders("2026-08-10", seq, now).map((p) => p.sequence_step);
      expect(new Set(steps).size).toBe(steps.length);
    }
  });
});

describe("planReminders — boundaries", () => {
  it("treats a step due exactly now as missed, not future", () => {
    const now = new Date("2026-08-10T09:00:00.000Z");
    const planned = planReminders("2026-08-10", [step(1, 0, "on_due")], now);

    expect(planned).toHaveLength(1);
    expect(planned[0]!.catch_up).toBe(true);
  });

  it("returns nothing for an empty sequence", () => {
    expect(planReminders("2026-08-10", [], new Date("2026-08-01T00:00:00Z"))).toEqual([]);
  });

  it("sorts unordered steps before planning", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const shuffled = [step(3, 7), step(1, 0, "on_due"), step(2, 3)];
    const planned = planReminders("2026-08-10", shuffled, now);

    expect(planned.map((p) => p.sequence_step)).toEqual([1, 2, 3]);
  });

  it("carries the step's own copy through to the plan", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const planned = planReminders("2026-08-10", FRIENDLY, now);

    expect(planned[0]!.subject).toBe("Subject 1");
    expect(planned[0]!.body).toBe("Body 1");
  });
});
