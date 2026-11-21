import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useRadioGroup } from "@platform/ui";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
import ResumeJobOption from "../ResumeJobOption";

const JOBS = [
  { id: "j1", status: "complete", file_name: "alpha.pdf" },
  { id: "j2", status: "complete", file_name: "beta.pdf" },
] as unknown as ResumeUploadJob[];

function Group({ onPick }: { onPick: (id: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const { getRadioProps } = useRadioGroup(
    JOBS.map((job) => job.id),
    picked,
    (id) => {
      setPicked(id);
      onPick(id);
    },
  );
  return (
    <div role="radiogroup" aria-label="Resume to refine">
      {JOBS.map((job) => (
        <ResumeJobOption key={job.id} job={job} selected={picked === job.id} radioProps={getRadioProps(job.id)} />
      ))}
    </div>
  );
}

describe("ResumeJobOption", () => {
  it("reports which resume is picked as a checked radio", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Group onPick={onPick} />);

    expect(screen.queryByRole("radio", { checked: true })).toBeNull();
    await user.click(screen.getAllByRole("radio")[1]);
    expect(onPick).toHaveBeenCalledWith("j2");
    expect(screen.getAllByRole("radio")[1]).toBeChecked();
  });

  it("moves the pick with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Group onPick={vi.fn()} />);

    await user.tab();
    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("radio")[1]).toHaveFocus();
    expect(screen.getAllByRole("radio")[1]).toBeChecked();
  });
});
