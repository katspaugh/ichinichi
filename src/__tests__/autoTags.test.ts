// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  entryText,
  activityCandidates,
  tagsFromScores,
} from "../utils/autoTags";
import { autoTagReducer, initialAutoTagState } from "../hooks/useAutoTagIndex";

describe("model auto tags", () => {
  it("extracts only journal text, preserving paragraph boundaries", () => {
    expect(
      entryText(
        '<p>Trumpet &amp; piano</p><p>Practice</p><img alt="private"><script>bad()</script>',
      ),
    ).toBe("Trumpet & piano\nPractice");
  });
  it("includes custom section tags as model candidates without duplicates", () => {
    const candidates = activityCandidates(["trumpet", "bird-watching"]);
    expect(candidates.filter((c) => c.type === "trumpet")).toHaveLength(2);
    expect(candidates.find((c) => c.type === "bird-watching")).toBeDefined();
  });
  it("accepts only confident, known model labels", () => {
    const candidates = activityCandidates([]);
    expect(
      tagsFromScores(
        {
          labels: [candidates[0].label, candidates[1].label, "unknown"],
          scores: [0.94, 0.4, 1],
        },
        candidates,
      ),
    ).toEqual([candidates[0].type]);
  });
  it("rejects stale results after disabling or editing notes", () => {
    const processing = autoTagReducer(initialAutoTagState, {
      type: "INPUTS",
      scope: {},
      year: 2026,
      entries: [{ date: "20-10-2026", content: "hello" }],
    });
    const disabled = autoTagReducer(processing, { type: "DISABLE" });
    expect(
      autoTagReducer(disabled, {
        type: "DONE",
        revision: processing.revision,
        tags: new Map([["20-10-2026", ["trumpet"]]]),
      }),
    ).toBe(disabled);
    const edited = autoTagReducer(processing, {
      type: "INPUTS",
      scope: processing.scope!,
      year: 2026,
      entries: [],
    });
    expect(
      autoTagReducer(edited, {
        type: "DONE",
        revision: processing.revision,
        tags: new Map(),
      }),
    ).toBe(edited);
  });
  it("clears old results when switching database or year", () => {
    const state = {
      ...initialAutoTagState,
      tags: new Map([["20-10-2026", ["trumpet"]]]),
    };
    const next = autoTagReducer(state, {
      type: "INPUTS",
      scope: {},
      year: 2025,
      entries: [],
    });
    expect(next.tags.size).toBe(0);
    expect(next.phase).toBe("classifying");
  });
});

it("does not restart analysis when RxDB re-emits unchanged note content", () => {
  const scope = {};
  const action = {
    type: "INPUTS" as const,
    scope,
    year: 2026,
    entries: [
      { date: "19-10-2026", content: "hello" },
      { date: "20-10-2026", content: "world" },
    ],
  };
  const state = autoTagReducer(initialAutoTagState, action);
  expect(
    autoTagReducer(state, {
      ...action,
      entries: action.entries.map((entry) => ({ ...entry })).reverse(),
    }),
  ).toBe(state);
});
