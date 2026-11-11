import { describe, expect, it } from "vitest";
import { KANBAN_LANE_LABELS } from "../constants/kanbanLaneLabels";
import { KANBAN_LANE_ORDER } from "../constants/kanbanLaneOrder";
import { MS_PER_DAY } from "../constants/stageAge";
import type { KanbanItem } from "../types/kanban/kanban-item";
import { companyLogoUrl } from "../utils/companyLogoUrl";
import { daysInStage } from "../utils/daysInStage";
import { formatDaysInStage } from "../utils/formatDaysInStage";
import { formatVerdict } from "../utils/formatVerdict";
import { groupKanbanItems } from "../utils/groupKanbanItems";
import { kanbanLaneFor } from "../utils/kanbanLaneFor";
import { optimisticStage } from "../utils/optimisticStage";
import { splitKanbanLanes } from "../utils/splitKanbanLanes";
import { stageAgeTone } from "../utils/stageAgeTone";
import { toneForVerdict } from "../utils/toneForVerdict";

function makeItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: "a",
    role_title: "Senior Engineer",
    applied_at: null,
    archived: false,
    company_id: "c1",
    company_name: "Acme",
    company_logo_url: null,
    latest_event_type: "applied",
    stage_entered_at: "2026-05-01T00:00:00Z",
    verdict: null,
    ...overrides,
  };
}

describe("groupKanbanItems", () => {
  it("puts each card in its stage's column, keeping the server's order", () => {
    const items = [
      makeItem({ id: "1", latest_event_type: "interview_completed" }),
      makeItem({ id: "2", latest_event_type: "ghosted" }),
      makeItem({ id: "3", latest_event_type: null }),
      makeItem({ id: "4", latest_event_type: "offer_received" }),
      makeItem({ id: "5", latest_event_type: "interview_scheduled" }),
      makeItem({ id: "6", latest_event_type: "added_on_the_backend_later" }),
    ];
    const ids = Object.fromEntries(Object.entries(groupKanbanItems(items)).map(([column, cards]) => [column, cards.map((card) => card.id)]));
    expect(ids).toEqual({ applied: ["3", "6"], interviewing: ["1", "5"], offer: ["4"], closed: ["2"] });
  });

  it("has every column, empty, for no cards", () => {
    expect(groupKanbanItems([])).toEqual({ applied: [], interviewing: [], offer: [], closed: [] });
  });
});

describe("swim lanes", () => {
  it("puts only strong fits in the strong fit lane", () => {
    expect(kanbanLaneFor("strong_fit")).toBe("strong_fit");
    for (const verdict of ["worth_considering", "stretch", "mismatch", "unknown", null]) {
      expect(kanbanLaneFor(verdict)).toBe("everything_else");
    }
  });

  it("splits a column's cards by lane in order", () => {
    const items = [
      makeItem({ id: "1", verdict: "stretch" }),
      makeItem({ id: "2", verdict: "strong_fit" }),
      makeItem({ id: "3", verdict: null }),
      makeItem({ id: "4", verdict: "strong_fit" }),
    ];
    const lanes = splitKanbanLanes(items);
    expect(lanes.strong_fit.map((card) => card.id)).toEqual(["2", "4"]);
    expect(lanes.everything_else.map((card) => card.id)).toEqual(["1", "3"]);
  });

  it("orders and labels the lanes as the web board does", () => {
    expect(KANBAN_LANE_ORDER.map((lane) => KANBAN_LANE_LABELS[lane])).toEqual(["Strong fit", "Everything else"]);
  });
});

describe("days in stage", () => {
  const entered = "2026-05-01T00:00:00Z";
  const at = (days: number, extraMs = 0) => new Date(entered).getTime() + days * MS_PER_DAY + extraMs;

  it("counts whole days since the card entered its stage", () => {
    expect(daysInStage(entered, at(0))).toBe(0);
    expect(daysInStage(entered, at(6, MS_PER_DAY - 1))).toBe(6);
    expect(daysInStage(entered, at(15))).toBe(15);
  });

  it("is unknown without a readable date", () => {
    expect(daysInStage(null, at(3))).toBeNull();
    expect(daysInStage("", at(3))).toBeNull();
    expect(daysInStage("not a date", at(3))).toBeNull();
  });

  it("shows a badge from a week, a warning from two weeks and danger from three", () => {
    expect(stageAgeTone(null)).toBeNull();
    expect(stageAgeTone(6)).toBeNull();
    expect(stageAgeTone(7)).toBe("neutral");
    expect(stageAgeTone(13)).toBe("neutral");
    expect(stageAgeTone(14)).toBe("warning");
    expect(stageAgeTone(20)).toBe("warning");
    expect(stageAgeTone(21)).toBe("danger");
    expect(formatDaysInStage(21)).toBe("21d in stage");
  });
});

describe("verdicts", () => {
  it("uses the shared label for a known verdict and shows an unknown one as-is", () => {
    expect(formatVerdict("strong_fit")).toBe("Strong fit");
    expect(formatVerdict("worth_considering")).toBe("Worth considering");
    expect(formatVerdict("long_shot")).toBe("long_shot");
    expect(formatVerdict(null)).toBeNull();
    expect(formatVerdict("")).toBeNull();
  });

  it("tones each known verdict, and info for an unknown or missing one", () => {
    expect(toneForVerdict("strong_fit")).toBe("success");
    expect(toneForVerdict("worth_considering")).toBe("info");
    expect(toneForVerdict("stretch")).toBe("warning");
    expect(toneForVerdict("mismatch")).toBe("danger");
    expect(toneForVerdict("long_shot")).toBe("info");
    expect(toneForVerdict(null)).toBe("info");
  });
});

describe("companyLogoUrl", () => {
  it("keeps http and https logos", () => {
    expect(companyLogoUrl("https://logo.example/acme.png")).toBe("https://logo.example/acme.png");
    expect(companyLogoUrl(" http://logo.example/a.png ")).toBe("http://logo.example/a.png");
  });

  it("drops any other scheme, a bare word or nothing", () => {
    for (const url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd", "myjobhunter://x", "logo.png", ""]) {
      expect(companyLogoUrl(url)).toBeNull();
    }
    expect(companyLogoUrl(null)).toBeNull();
  });
});

describe("optimisticStage", () => {
  it("puts a moved card in the target column's default event type, entered when it moved", () => {
    const occurred = "2026-06-01T00:00:00Z";
    expect(optimisticStage("interviewing", occurred)).toEqual({ latest_event_type: "interview_scheduled", stage_entered_at: occurred });
  });

  it("maps each target column to the correct default event_type", () => {
    const occurred = "2026-06-01T00:00:00Z";
    expect(optimisticStage("applied", occurred).latest_event_type).toBe("applied");
    expect(optimisticStage("interviewing", occurred).latest_event_type).toBe("interview_scheduled");
    expect(optimisticStage("offer", occurred).latest_event_type).toBe("offer_received");
    expect(optimisticStage("closed", occurred).latest_event_type).toBe("rejected");
  });
});
