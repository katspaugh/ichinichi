import { render, screen } from "@testing-library/react";
import { SyncIndicator } from "../components/SyncIndicator/SyncIndicator";
import { NoteEditorView } from "../components/NoteEditor/NoteEditorView";
import { SyncStatus } from "../types";
import React from "react";

/**
 * Tests for the "Saving..." and "Syncing..." indicators.
 *
 * These tests verify that the UI components correctly display status indicators
 * when the appropriate props are passed.
 *
 * Bug: "Saving..." and "Syncing..." indicators are not appearing in the app.
 * These tests help isolate whether the issue is in:
 * 1. The component rendering logic (tested here)
 * 2. The state machine/hook logic (tested in useSyncMachine.test.ts)
 * 3. The data flow between hooks and components
 */

describe("SyncIndicator component", () => {
  it("should render 'Syncing...' when status is Syncing", () => {
    render(<SyncIndicator status={SyncStatus.Syncing} />);

    expect(screen.getByText("Syncing...")).toBeTruthy();
  });

  it("should render 'Synced' when status is Synced", () => {
    render(<SyncIndicator status={SyncStatus.Synced} />);

    expect(screen.getByText("Synced")).toBeTruthy();
  });

  it("should render 'Offline' when status is Offline", () => {
    render(<SyncIndicator status={SyncStatus.Offline} />);

    expect(screen.getByText("Offline")).toBeTruthy();
  });

  it("should render 'Sync error' when status is Error", () => {
    render(<SyncIndicator status={SyncStatus.Error} />);

    expect(screen.getByText("Sync error")).toBeTruthy();
  });

  it("should render nothing when status is Idle and no pending ops", () => {
    const { container } = render(<SyncIndicator status={SyncStatus.Idle} />);

    expect(container.textContent).toBe("");
  });

  it("should render 'Sync needed' when status is Idle but has pending ops", () => {
    render(
      <SyncIndicator
        status={SyncStatus.Idle}
        pendingOps={{ notes: 1, images: 0, total: 1 }}
      />,
    );

    expect(screen.getByText("Sync needed")).toBeTruthy();
  });

  it("should render spinner when syncing", () => {
    const { container } = render(<SyncIndicator status={SyncStatus.Syncing} />);

    // The spinner is a span with a specific class
    const spinner = container.querySelector("span span");
    expect(spinner).toBeTruthy();
  });
});

describe("NoteEditorView status text", () => {
  const defaultProps = {
    formattedDate: "January 16, 2026",
    isEditable: true,
    showReadonlyBadge: false,
    placeholderText: "Write your note...",
    editorRef: React.createRef<HTMLDivElement>(),
    onInput: jest.fn(),
    onPaste: jest.fn(),
    onDrop: jest.fn(),
    onDragOver: jest.fn(),
    onClick: jest.fn(),
    onKeyDown: jest.fn(),
    isDraggingImage: false,
  };

  it("should render 'Saving...' when statusText is 'Saving...'", () => {
    render(<NoteEditorView {...defaultProps} statusText="Saving..." />);

    expect(screen.getByText("Saving...")).toBeTruthy();
  });

  it("should render 'Decrypting...' when statusText is 'Decrypting...'", () => {
    render(<NoteEditorView {...defaultProps} statusText="Decrypting..." />);

    expect(screen.getByText("Decrypting...")).toBeTruthy();
  });

  it("should NOT render status text when statusText is null", () => {
    render(<NoteEditorView {...defaultProps} statusText={null} />);

    expect(screen.queryByText("Saving...")).toBeNull();
    expect(screen.queryByText("Decrypting...")).toBeNull();
  });
});
