import { aGmail, aSyncLog } from "../test-support/integrationsServer";
import { gmailConnection, gmailIntegration } from "../src/features/integrations/gmailConnection";
import { funnelRows, syncStatusColor } from "../src/features/integrations/syncSessionDisplay";
import { actionFailureCopy } from "../src/lib/writeFailureCopy";
import { shortDateTime } from "../src/utils/shortDateTime";
import { lightColors } from "@platform/mobile";

describe("gmailConnection", () => {
  it("is none when Gmail isn't listed, or is listed as not connected", () => {
    expect(gmailConnection(gmailIntegration(undefined))).toBe("none");
    expect(gmailConnection(gmailIntegration([{ provider: "other", connected: true, last_synced_at: null }]))).toBe("none");
    expect(gmailConnection(aGmail({ connected: false }))).toBe("none");
  });

  it("tells a working link from one whose sign-in expired", () => {
    expect(gmailConnection(aGmail())).toBe("connected");
    expect(gmailConnection(aGmail({ needs_reauth: true }))).toBe("reauth");
  });
});

describe("funnelRows", () => {
  it("shows the full funnel once Gmail matched something and new emails were found", () => {
    const rows = funnelRows(aSyncLog({ gmail_matches_total: 10, emails_total: 4, emails_fetched: 3, emails_done: 2 }));
    expect(rows.map((row) => row.value)).toEqual([10, 4, 3, 2]);
  });

  it("stops after the dedup line when nothing was new", () => {
    expect(funnelRows(aSyncLog({ gmail_matches_total: 10, emails_total: 0 }))).toHaveLength(2);
  });

  it("uses the older three lines without match counts, and none without emails", () => {
    expect(funnelRows(aSyncLog({ emails_total: 5, emails_fetched: 4, emails_done: 3 })).map((row) => row.value)).toEqual([5, 4, 3]);
    expect(funnelRows(aSyncLog())).toEqual([]);
  });
});

describe("syncStatusColor", () => {
  it("colours success and failure, and leaves the rest readable", () => {
    expect(syncStatusColor(lightColors, "success")).toBe(lightColors.positiveText);
    expect(syncStatusColor(lightColors, "failed")).toBe(lightColors.destructiveText);
    expect(syncStatusColor(lightColors, "running")).toBe(lightColors.primary);
    expect(syncStatusColor(lightColors, "partial")).toBe(lightColors.foreground);
    expect(syncStatusColor(lightColors, "cancelled")).toBe(lightColors.foreground);
  });
});

describe("actionFailureCopy", () => {
  it("names the action in each failure, and lets one be replaced", () => {
    const copy = actionFailureCopy("start the sync", { conflict: "Already running." });
    expect(copy.noResponse).toBe("I can't reach the server, so I couldn't start the sync.");
    expect(copy.serverError).toBe("I couldn't start the sync. Want to try again?");
    expect(copy.conflict).toBe("Already running.");
  });
});

describe("shortDateTime", () => {
  it("reads in the phone's time zone", () => {
    expect(shortDateTime("2026-11-01T20:30:00Z")).toBe("Nov 1, 2026, 12:30 PM");
  });
});
