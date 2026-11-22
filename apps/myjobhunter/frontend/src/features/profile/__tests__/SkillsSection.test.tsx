/**
 * SkillsSection — removing a skill asks first (Keep leaves it, Remove sends the delete), names the skill
 * on a 44px button, treats an already-gone skill as removed, and keeps the question open on a failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SKILL_REMOVE_MESSAGES } from "@myjobhunter/api-client/constants/skillRemoveMessages";
import type { Skill } from "@myjobhunter/api-client/types/skill/skill";
import { skillRemoveBody } from "@myjobhunter/api-client/utils/skillRemoveBody";
import { SKILL_MESSAGES as MESSAGES } from "@/constants/skill-messages";

const removeImpl = vi.fn<(id: string) => Promise<unknown>>();

vi.mock("@myjobhunter/api-client/store/skillsApi", async () => {
  const { useState } = await import("react");
  return {
    useCreateSkillMutation: () => [vi.fn(), { isLoading: false }] as const,
    useDeleteSkillMutation: () => {
      const [isLoading, setIsLoading] = useState(false);
      const trigger = (id: string) => {
        setIsLoading(true);
        const pending = removeImpl(id);
        return { unwrap: () => pending.finally(() => setIsLoading(false)) };
      };
      return [trigger, { isLoading }] as const;
    },
  };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    extractErrorMessage: (err: unknown) => (err as { message?: string }).message ?? "error",
    isNotFound: (err: unknown) => (err as { status?: number }).status === 404,
  };
});

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => children };
});

import { showError, showSuccess } from "@platform/ui";
import SkillsSection from "../SkillsSection";

const TIMESTAMP = "2026-11-01T00:00:00Z";
const TYPESCRIPT: Skill = {
  id: "s-1",
  user_id: "u1",
  profile_id: "p1",
  name: "TypeScript",
  years_experience: 5,
  category: null,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

async function askToRemove(user: ReturnType<typeof userEvent.setup>) {
  render(<SkillsSection skills={[TYPESCRIPT]} />);
  await user.click(screen.getByRole("button", { name: MESSAGES.removeLabel("TypeScript") }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  removeImpl.mockReset().mockResolvedValue(undefined);
});

describe("removing a skill", () => {
  it("names the skill on a 44px button", () => {
    render(<SkillsSection skills={[TYPESCRIPT]} />);
    const button = screen.getByRole("button", { name: "Remove TypeScript" });
    expect(button.className).toContain("min-h-[44px]");
    expect(button.className).toContain("min-w-[44px]");
  });

  it("asks first, with the shared question, and sends nothing yet", async () => {
    const user = userEvent.setup();
    const dialog = await askToRemove(user);

    expect(within(dialog).getByText(SKILL_REMOVE_MESSAGES.title)).toBeInTheDocument();
    expect(within(dialog).getByText(skillRemoveBody("TypeScript"))).toBeInTheDocument();
    expect(removeImpl).not.toHaveBeenCalled();
  });

  it("keeps the skill when they choose Keep", async () => {
    const user = userEvent.setup();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.keep }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(removeImpl).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("removes it and toasts once they confirm", async () => {
    const user = userEvent.setup();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.remove }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.removed("TypeScript")));
    expect(removeImpl).toHaveBeenCalledExactlyOnceWith("s-1");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reads a skill that is already gone as removed", async () => {
    removeImpl.mockRejectedValue({ status: 404 });
    const user = userEvent.setup();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.remove }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.removed("TypeScript")));
    expect(showError).not.toHaveBeenCalled();
  });

  it("says why it failed and keeps the question open to try again", async () => {
    removeImpl.mockRejectedValue({ status: 500, message: "boom" });
    const user = userEvent.setup();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.remove }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(`${MESSAGES.couldntRemove}: boom`));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
