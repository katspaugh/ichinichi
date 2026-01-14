import {
  initialNoteContentState,
  noteContentReducer,
  type NoteContentState,
} from "../hooks/useNoteContent";

describe("noteContentReducer", () => {
  it("resets to idle state", () => {
    const state: NoteContentState = {
      status: "ready",
      date: "2026-01-03",
      content: "hello",
      hasEdits: true,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error: null,
    };

    expect(noteContentReducer(state, { type: "RESET" })).toEqual(
      initialNoteContentState,
    );
  });

  it("starts loading for a date", () => {
    const next = noteContentReducer(initialNoteContentState, {
      type: "LOAD_START",
      date: "2026-01-03",
    });

    expect(next).toEqual({
      status: "loading",
      date: "2026-01-03",
      content: "",
      hasEdits: false,
      isDecrypting: true,
      isContentReady: false,
      isOfflineStub: false,
      error: null,
    });
  });

  it("loads content when load succeeds", () => {
    const loading = noteContentReducer(initialNoteContentState, {
      type: "LOAD_START",
      date: "2026-01-03",
    });

    const next = noteContentReducer(loading, {
      type: "LOAD_SUCCESS",
      date: "2026-01-03",
      content: "saved",
    });

    expect(next).toEqual({
      status: "ready",
      date: "2026-01-03",
      content: "saved",
      hasEdits: false,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error: null,
    });
  });

  it("ignores load success for another date", () => {
    const loading = noteContentReducer(initialNoteContentState, {
      type: "LOAD_START",
      date: "2026-01-03",
    });

    const next = noteContentReducer(loading, {
      type: "LOAD_SUCCESS",
      date: "2026-02-01",
      content: "saved",
    });

    expect(next).toEqual(loading);
  });

  it("records load errors as editable state", () => {
    const loading = noteContentReducer(initialNoteContentState, {
      type: "LOAD_START",
      date: "2026-01-03",
    });

    const error = new Error("boom");
    const next = noteContentReducer(loading, {
      type: "LOAD_ERROR",
      date: "2026-01-03",
      error,
    });

    expect(next).toEqual({
      status: "error",
      date: "2026-01-03",
      content: "",
      hasEdits: false,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error,
    });
  });

  it("accepts remote updates when there are no edits", () => {
    const loading = noteContentReducer(initialNoteContentState, {
      type: "LOAD_START",
      date: "2026-01-03",
    });

    const next = noteContentReducer(loading, {
      type: "REMOTE_UPDATE",
      date: "2026-01-03",
      content: "fresh",
    });

    expect(next).toEqual({
      status: "ready",
      date: "2026-01-03",
      content: "fresh",
      hasEdits: false,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error: null,
    });
  });

  it("ignores remote updates when edits exist", () => {
    const ready: NoteContentState = {
      status: "ready",
      date: "2026-01-03",
      content: "draft",
      hasEdits: true,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error: null,
    };

    const next = noteContentReducer(ready, {
      type: "REMOTE_UPDATE",
      date: "2026-01-03",
      content: "fresh",
    });

    expect(next).toEqual(ready);
  });

  it("marks edits and clears error states", () => {
    const errorState: NoteContentState = {
      status: "error",
      date: "2026-01-03",
      content: "",
      hasEdits: false,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error: new Error("boom"),
    };

    const next = noteContentReducer(errorState, {
      type: "EDIT",
      content: "new note",
    });

    expect(next).toEqual({
      status: "ready",
      date: "2026-01-03",
      content: "new note",
      hasEdits: true,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error: null,
    });
  });

  it("clears edits only when save matches current content", () => {
    const ready: NoteContentState = {
      status: "ready",
      date: "2026-01-03",
      content: "draft",
      hasEdits: true,
      isDecrypting: false,
      isContentReady: true,
      isOfflineStub: false,
      error: null,
    };

    const unchanged = noteContentReducer(ready, {
      type: "SAVE_SUCCESS",
      date: "2026-01-03",
      content: "old",
    });

    expect(unchanged).toEqual(ready);

    const cleared = noteContentReducer(ready, {
      type: "SAVE_SUCCESS",
      date: "2026-01-03",
      content: "draft",
    });

    expect(cleared).toEqual({
      ...ready,
      hasEdits: false,
    });
  });
});
