import { render } from "@testing-library/react";
import { NoteEditorHeader } from "../components/NoteEditor/NoteEditorHeader";

describe("NoteEditorHeader error display", () => {
  it("shows error text with error styling", () => {
    const { container } = render(
      <NoteEditorHeader
        date="10-01-2026"
        formattedDate="January 10, 2026"
        showReadonlyBadge={false}
        statusText="Unable to decrypt note"
        isStatusError={true}
      />,
    );

    const status = container.querySelector("[aria-live='polite']")!;
    expect(status.textContent).toBe("Unable to decrypt note");
    expect(status.className).toContain("statusError");
  });

  it("does not apply error class for non-error status", () => {
    const { container } = render(
      <NoteEditorHeader
        date="10-01-2026"
        formattedDate="January 10, 2026"
        showReadonlyBadge={false}
        statusText="Decrypting..."
        isStatusError={false}
      />,
    );

    const status = container.querySelector("[aria-live='polite']")!;
    expect(status.textContent).toBe("Decrypting...");
    expect(status.className).not.toContain("statusError");
  });

  it("does not render status element when there is no status", () => {
    const { container } = render(
      <NoteEditorHeader
        date="10-01-2026"
        formattedDate="January 10, 2026"
        showReadonlyBadge={false}
        statusText={null}
      />,
    );

    const status = container.querySelector("[aria-live='polite']");
    expect(status).toBeNull();
  });
});
