// @vitest-environment jsdom
import { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { NoteLogView } from "../components/NoteLog/NoteLogView";
import {
  entryHandoffReducer,
  type EntryHandoffState,
} from "../components/NoteLog/useEntryHandoff";
import { ok } from "../domain/result";
import { getTodayString } from "../utils/date";

vi.mock("../contexts/weatherContext", () => ({
  useWeatherContext: () => ({
    state: { showWeather: false, dailyWeather: null },
    formatWeatherLabel: () => null,
  }),
}));

const imageRepository = {
  upload: vi.fn(),
  get: vi.fn().mockResolvedValue(ok(new Blob(["img"], { type: "image/jpeg" }))),
  getUrl: vi.fn().mockResolvedValue(ok(null)),
  delete: vi.fn().mockResolvedValue(ok(undefined)),
  getByNoteDate: vi.fn().mockResolvedValue(ok([])),
  deleteByNoteDate: vi.fn().mockResolvedValue(ok(undefined)),
};

vi.mock("../contexts/noteRepositoryContext", () => ({
  useNoteRepositoryContext: () => ({
    imageRepository,
    weather: null,
    noteSections: new Map(),
  }),
}));

vi.mock("../utils/imageCompression", () => ({
  compressImage: vi.fn(async (file: File) => ({
    blob: file,
    width: 120,
    height: 80,
    mimeType: file.type,
  })),
}));

vi.mock("../contexts/routingContext", () => ({
  useRoutingContext: () => ({ navigateToDate: vi.fn() }),
}));

const IDLE: EntryHandoffState = {
  phase: "idle",
  entry: null,
  releasedId: null,
};

const ENTRY = {
  id: "2026-09-17T09:00:00.000Z",
  date: getTodayString(),
  label: "9:00 AM",
  html: "walked the dog",
};

describe("entryHandoffReducer", () => {
  it("holds a committed entry, then releases it to the timeline", () => {
    const holding = entryHandoffReducer(IDLE, { type: "commit", entry: ENTRY });
    expect(holding).toEqual({
      phase: "holding",
      entry: ENTRY,
      releasedId: null,
    });

    const revealing = entryHandoffReducer(holding, { type: "reveal" });
    expect(revealing).toEqual({
      phase: "revealing",
      entry: null,
      releasedId: ENTRY.id,
    });

    expect(entryHandoffReducer(revealing, { type: "settle" })).toEqual(IDLE);
  });

  it("ignores transitions that do not belong to the current phase", () => {
    expect(entryHandoffReducer(IDLE, { type: "reveal" })).toBe(IDLE);
    expect(entryHandoffReducer(IDLE, { type: "settle" })).toBe(IDLE);

    const holding = entryHandoffReducer(IDLE, { type: "commit", entry: ENTRY });
    expect(entryHandoffReducer(holding, { type: "settle" })).toBe(holding);
  });
});

function Harness() {
  const [content, setContent] = useState("");
  return (
    <NoteLogView
      date={getTodayString()}
      content={content}
      onChange={setContent}
      isContentReady={true}
    />
  );
}

function renderHarness() {
  const utils = render(<Harness />);
  const editor = utils.getByLabelText("New entry");
  const composer = () =>
    utils.container.querySelector("[data-moment-time='now']") as HTMLElement;
  const held = () => utils.container.querySelector(".committed");
  const stack = () => utils.container.querySelector(".stack");
  const fileInput = utils.container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { ...utils, editor, composer, held, stack, fileInput };
}

/** Let pending promise chains (image URL resolution) run to completion. */
async function flush() {
  await act(async () => {});
  await act(async () => {});
}

describe("NoteLogView entry handoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the submitted entry in the composer's place before the editor returns", () => {
    const { editor, composer, held, stack, getByLabelText } = renderHarness();

    editor.textContent = "walked the dog";
    act(() => {
      fireEvent.click(getByLabelText("Save entry"));
    });

    // The entry stands where it was written; the editor is empty behind it
    expect(held()?.textContent).toContain("walked the dog");
    expect(composer().dataset.committed).toBe("true");
    expect(editor.textContent).toBe("");
    // ...and it is not also sitting at the top of the timeline
    expect(stack()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    // Handoff: the entry joins the timeline, the editor fades back in
    expect(held()).toBeNull();
    expect(composer().dataset.committed).toBeUndefined();
    expect(composer().dataset.entering).toBe("true");
    expect(stack()?.textContent).toContain("walked the dog");

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(composer().dataset.entering).toBeUndefined();
  });

  it("cuts the hold short when the next entry is already being typed", () => {
    const { editor, held, stack, getByLabelText } = renderHarness();

    editor.textContent = "walked the dog";
    act(() => {
      fireEvent.click(getByLabelText("Save entry"));
    });
    expect(held()).not.toBeNull();

    editor.textContent = "and fed the cat";
    act(() => {
      fireEvent.input(editor);
    });

    expect(held()).toBeNull();
    expect(stack()?.textContent).toContain("walked the dog");
    expect(editor.textContent).toBe("and fed the cat");
  });

  it("resolves the entry's image again once it reaches the timeline", async () => {
    imageRepository.upload.mockResolvedValue(
      ok({
        id: "img-1",
        noteDate: getTodayString(),
        type: "inline",
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        width: 120,
        height: 80,
        size: 4,
        createdAt: new Date().toISOString(),
      }),
    );
    const { container, held, fileInput, getByLabelText } = renderHarness();

    fireEvent.change(fileInput, {
      target: { files: [new File(["data"], "photo.jpg", { type: "image/jpeg" })] },
    });
    await flush();
    act(() => {
      fireEvent.click(getByLabelText("Save entry"));
    });
    await flush();

    expect(held()?.querySelector("img[data-image-id='img-1']")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await flush();

    // Handing the entry over re-mounts it, so the resolved src has to be
    // applied to the new node or the image comes back blank.
    const image = container.querySelector(".stack img[data-image-id='img-1']");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("blob:preview");
  });

  it("drops a held entry when the day changes underneath it", () => {
    const { editor, held, getByLabelText, rerender } = renderHarness();

    editor.textContent = "walked the dog";
    act(() => {
      fireEvent.click(getByLabelText("Save entry"));
    });
    expect(held()).not.toBeNull();

    rerender(
      <NoteLogView
        date="16-09-2026"
        content=""
        onChange={vi.fn()}
        isContentReady={true}
      />,
    );

    expect(held()).toBeNull();
  });
});
