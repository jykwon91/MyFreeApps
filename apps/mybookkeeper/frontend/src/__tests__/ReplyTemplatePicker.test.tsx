import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReplyTemplatePicker from "@/app/features/inquiries/ReplyTemplatePicker";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";

function makeTemplate(id: string, name: string): ReplyTemplate {
  return {
    id,
    organization_id: "o1",
    user_id: "u1",
    name,
    subject_template: "Re: $listing",
    body_template: `Body of ${name}`,
    is_archived: false,
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const TEMPLATES = [makeTemplate("t1", "Initial reply"), makeTemplate("t2", "Polite decline")];

describe("ReplyTemplatePicker", () => {
  it("is a named radiogroup whose chosen template is checked", () => {
    render(<ReplyTemplatePicker templates={TEMPLATES} selectedTemplateId="t2" onSelect={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Reply template" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Polite decline");
    expect(screen.getByRole("radio", { name: /Initial reply/, checked: false })).toBeInTheDocument();
  });

  it("selects a template on click and with the arrow keys", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ReplyTemplatePicker templates={TEMPLATES} selectedTemplateId="t1" onSelect={onSelect} />);

    await user.click(screen.getByRole("radio", { name: /Polite decline/ }));
    expect(onSelect).toHaveBeenLastCalledWith(TEMPLATES[1]);

    screen.getByRole("radio", { name: /Initial reply/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Polite decline/ })).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith(TEMPLATES[1]);
  });
});
