import { duplicateFailureMessage } from "../src/features/duplicates/duplicateFailure";
import {
  duplicateCountLine,
  duplicateFieldValue,
  duplicateMergeMode,
  duplicatePairName,
  duplicateSideLabel,
  duplicateSourceCount,
  duplicateStatusLabel,
  mergedTagCount,
} from "../src/features/duplicates/duplicateDisplay";
import { exportFailureMessage, exportFileName } from "../src/features/transactions/transactionExport";
import { aDuplicatePair, aDuplicateSide } from "../test-support/aDuplicatePair";
import { aProperty } from "../test-support/transactionsServer";

describe("duplicate display", () => {
  it("counts in words", () => {
    expect(duplicateCountLine(1)).toBe("1 possible duplicate");
    expect(duplicateCountLine(3)).toBe("3 possible duplicates");
  });

  it("writes each field as a person reads it, or nothing when it's empty", () => {
    const side = aDuplicateSide({ description: "Lumber", channel: "airbnb" });
    const properties = [aProperty({ id: "p1", name: "Oak Street" })];
    expect(duplicateFieldValue("amount", side, properties)).toBe("$84.20");
    expect(duplicateFieldValue("category", side, properties)).toBe("Maintenance");
    expect(duplicateFieldValue("property_id", side, properties)).toBe("Oak Street");
    expect(duplicateFieldValue("property_id", side, [])).toBe("A property");
    expect(duplicateFieldValue("property_id", aDuplicateSide({ property_id: null }), properties)).toBeNull();
    expect(duplicateFieldValue("description", side, properties)).toBe("Lumber");
    expect(duplicateFieldValue("payment_method", side, properties)).toBeNull();
    expect(duplicateFieldValue("channel", side, properties)).toBe("airbnb");
  });

  it("labels each side with where it came from", () => {
    expect(duplicateSideLabel("b", aDuplicateSide({ source_file_name: "jan.csv" }))).toBe("Record B: Bank import");
  });

  it("names a pair by whichever side has a vendor, then a description", () => {
    const named = aDuplicatePair({ transaction_a: aDuplicateSide({ vendor: null }), transaction_b: aDuplicateSide({ vendor: "Lowes" }) });
    expect(duplicatePairName(named)).toBe("Lowes");
    const described = aDuplicatePair({ transaction_a: aDuplicateSide({ vendor: null, description: "Lumber" }), transaction_b: aDuplicateSide({ vendor: null }) });
    expect(duplicatePairName(described)).toBe("Lumber");
    const bare = aDuplicatePair({ transaction_a: aDuplicateSide({ vendor: null }), transaction_b: aDuplicateSide({ vendor: null }) });
    expect(duplicatePairName(bare)).toBe("Untitled transaction");
  });

  it("counts a record's own document with the ones linked to it", () => {
    expect(duplicateSourceCount(aDuplicateSide({ source_document_id: "d1", linked_document_ids: ["d2", "d3"] }))).toBe(3);
    expect(duplicateSourceCount(aDuplicateSide())).toBe(0);
  });

  it("tells the three merge cases apart", () => {
    expect(duplicateMergeMode([])).toBe("no-conflicts");
    expect(duplicateMergeMode(["transaction_date"])).toBe("date-only");
    expect(duplicateMergeMode(["transaction_date", "vendor"])).toBe("conflicts");
    expect(duplicateMergeMode(["vendor"])).toBe("conflicts");
  });

  it("counts tags from both sides once", () => {
    expect(mergedTagCount(aDuplicateSide({ tags: ["a", "b"] }), aDuplicateSide({ tags: ["b", "c"] }))).toBe(3);
  });

  it("reads an unknown status as it came", () => {
    expect(duplicateStatusLabel("pending")).toBe("Pending");
    expect(duplicateStatusLabel("mystery")).toBe("mystery");
  });
});

describe("duplicate failures", () => {
  it("words each outcome for the action that failed", () => {
    expect(duplicateFailureMessage("merge", { status: 500 })).toBe("I couldn't merge those. Want to try again?");
    expect(duplicateFailureMessage("dismiss", { status: 500 })).toBe("I couldn't mark those as not duplicates. Want to try again?");
    expect(duplicateFailureMessage({ keep: "a" }, { status: 500 })).toBe("I couldn't resolve that duplicate. Want to try again?");
    expect(duplicateFailureMessage("merge", {})).toBe("I can't reach the server, so nothing changed. Check your connection.");
  });
});

describe("transaction export", () => {
  it("names the file by its format", () => {
    expect(exportFileName("csv")).toBe("transactions.csv");
    expect(exportFileName("pdf")).toBe("transactions.pdf");
  });

  it("tells a rate limit from any other failure", () => {
    expect(exportFailureMessage("csv", new Error("status code 429"))).toBe("I've made a lot of exports this hour. Try again in a bit.");
    expect(exportFailureMessage("pdf", new Error("boom"))).toBe("I couldn't export the PDF. Please try again in a bit.");
  });
});
