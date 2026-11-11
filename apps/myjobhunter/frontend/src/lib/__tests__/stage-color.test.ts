import { describe, it, expect } from "vitest";
import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import { getStageColor } from "@/lib/stage-color";

describe("getStageColor", () => {
  it.each(KANBAN_COLUMN_ORDER)("keeps the stage badge blue for %s", (column) => {
    expect(getStageColor(column)).toBe("blue");
  });
});
