import { describe, expect, it } from "vitest";
import {
  planLifecycleResume,
  planLifecycleSuspend,
} from "./lifecycle.js";

describe("lifecycle suspend／resume plans", () => {
  it("records running AI and seat poll so they can resume", () => {
    expect(
      planLifecycleSuspend({
        aiRunning: true,
        seatPollRunning: true,
      }),
    ).toEqual({
      stopAi: true,
      stopSeatPoll: true,
      clearSelection: true,
      suspendAudio: true,
      resumeAi: true,
      resumeSeatPoll: true,
    });
  });

  it("does not ask to resume loops that were idle", () => {
    expect(
      planLifecycleSuspend({
        aiRunning: false,
        seatPollRunning: false,
      }),
    ).toMatchObject({
      stopAi: false,
      stopSeatPoll: false,
      resumeAi: false,
      resumeSeatPoll: false,
    });
  });

  it("resumes AI only while solo still playing", () => {
    const snap = planLifecycleSuspend({
      aiRunning: true,
      seatPollRunning: false,
    });
    expect(
      planLifecycleResume(snap, { soloPlaying: true, hosting: false }),
    ).toEqual({ resumeAi: true, resumeSeatPoll: false, resumeAudio: true });
    expect(
      planLifecycleResume(snap, { soloPlaying: false, hosting: false }),
    ).toEqual({ resumeAi: false, resumeSeatPoll: false, resumeAudio: true });
  });

  it("resumes seat poll only while still hosting", () => {
    const snap = planLifecycleSuspend({
      aiRunning: false,
      seatPollRunning: true,
    });
    expect(
      planLifecycleResume(snap, { soloPlaying: false, hosting: true }),
    ).toEqual({ resumeAi: false, resumeSeatPoll: true, resumeAudio: true });
    expect(
      planLifecycleResume(snap, { soloPlaying: false, hosting: false }),
    ).toEqual({ resumeAi: false, resumeSeatPoll: false, resumeAudio: true });
  });
});
