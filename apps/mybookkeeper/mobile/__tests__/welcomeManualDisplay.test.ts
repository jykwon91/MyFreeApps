import { WEB_BASE_URL } from "../src/constants/api";
import { WELCOME_MANUAL_MESSAGES } from "../src/constants/welcomeManuals";
import { manualPropertyName, manualShareLink, manualShareMessage, placeLine, sectionSummaryLine } from "../src/features/welcomeManuals/welcomeManualDisplay";

const PROPERTIES = [{ id: "pr1", name: "Oak Street" }];

describe("manualPropertyName", () => {
  it("names the property, says when none is tagged, and stays blank until it knows", () => {
    expect(manualPropertyName("pr1", PROPERTIES)).toBe("Oak Street");
    expect(manualPropertyName(null, PROPERTIES)).toBe(WELCOME_MANUAL_MESSAGES.noProperty);
    expect(manualPropertyName("pr1", undefined)).toBeNull();
    expect(manualPropertyName("gone", PROPERTIES)).toBeNull();
  });
});

describe("the share link and message", () => {
  it("builds the guest link from the site address", () => {
    expect(manualShareLink("tok123")).toBe(`${WEB_BASE_URL}/guide/tok123`);
  });

  it("sends the link and the code together, and only the link when there's no code", () => {
    expect(manualShareMessage("tok123", "4829")).toBe(`Here's your guide: ${WEB_BASE_URL}/guide/tok123\nAccess code: 4829`);
    expect(manualShareMessage("tok123", null)).toBe(`Here's your guide: ${WEB_BASE_URL}/guide/tok123`);
  });
});

describe("placeLine", () => {
  it("leaves out a missing price", () => {
    expect(placeLine({ cuisine: "Tacos", price_tier: "$$" })).toBe("Tacos · $$");
    expect(placeLine({ cuisine: "Tacos", price_tier: null })).toBe("Tacos");
  });
});

describe("sectionSummaryLine", () => {
  it("counts fields and photos, in the singular for one", () => {
    expect(sectionSummaryLine({ fields: [], images: [] })).toBe("0 fields · 0 photos");
  });
});
