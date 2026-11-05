import { replyTemplatePageState } from "../src/features/replyTemplates/replyTemplatePageState";
import { aReplyTemplate } from "../test-support/aReplyTemplate";

const template = aReplyTemplate();
const settled = { template: undefined, list: undefined, error: undefined, isFetching: false, isLeaving: false };

describe("replyTemplatePageState", () => {
  it("shows the template once it's found, even while a reload runs or after one fails", () => {
    expect(replyTemplatePageState({ ...settled, template, list: [template], isFetching: true })).toBe("ready");
    expect(replyTemplatePageState({ ...settled, template, list: [template], error: new Error("x") })).toBe("ready");
  });

  it("loads while it's leaving, so it never flashes 'can't find'", () => {
    expect(replyTemplatePageState({ ...settled, template, list: [template], isLeaving: true })).toBe("loading");
    expect(replyTemplatePageState({ ...settled, list: [], isLeaving: true })).toBe("loading");
  });

  it("loads before the first answer and while a reload might still find it", () => {
    expect(replyTemplatePageState(settled)).toBe("loading");
    expect(replyTemplatePageState({ ...settled, list: [], isFetching: true })).toBe("loading");
  });

  it("says it couldn't load, not 'can't find', when the last load failed", () => {
    expect(replyTemplatePageState({ ...settled, error: new Error("x") })).toBe("couldntLoad");
    expect(replyTemplatePageState({ ...settled, list: [], error: new Error("x") })).toBe("couldntLoad");
  });

  it("says it's missing only when a list loaded without it", () => {
    expect(replyTemplatePageState({ ...settled, list: [] })).toBe("missing");
  });
});
