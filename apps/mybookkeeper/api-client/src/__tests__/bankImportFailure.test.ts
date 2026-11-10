import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANK_CSV_MAX_BYTES, BANK_IMPORT_FAILURE_MESSAGES as MESSAGES } from "../constants/bankImport";
import { bankImportFailure } from "../utils/bankImportFailure";
import { bankImportSummary } from "../utils/bankImportSummary";

describe("bankImportFailure", () => {
  it.each([
    [{ status: 413 }, MESSAGES.tooLarge],
    [{ status: 422 }, MESSAGES.unreadable],
    [{ status: 400 }, MESSAGES.notCsv],
    [{ status: 404 }, MESSAGES.other],
    [{ status: 403 }, MESSAGES.other],
    [{ status: 500 }, MESSAGES.unsure],
    [{ status: 503 }, MESSAGES.unsure],
    [{ error: "Network Error" }, MESSAGES.unsure],
    [undefined, MESSAGES.unsure],
  ])("maps %j to fixed words", (error, message) => {
    expect(bankImportFailure(error)).toBe(message);
  });

  it("never repeats what the server said", () => {
    expect(bankImportFailure({ status: 422, data: { detail: "No transactions found in CSV" } })).toBe(MESSAGES.unreadable);
  });

  it("mirrors the backend's MAX_CSV_SIZE", () => {
    const source = readFileSync(resolve(__dirname, "../../../backend/app/services/transactions/import_service.py"), "utf8");
    const match = /^MAX_CSV_SIZE\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/m.exec(source);
    expect(match).not.toBeNull();
    expect(BANK_CSV_MAX_BYTES).toBe(Number(match?.[1]) * 1024 * 1024);
  });
});

describe("bankImportSummary", () => {
  it("mentions duplicates only when some were skipped", () => {
    const base = { imported: 4, skipped_duplicates: 0, format_detected: "chase", preview: [] };
    expect(bankImportSummary(base)).toBe("Imported 4 transaction(s)");
    expect(bankImportSummary({ ...base, skipped_duplicates: 2 })).toBe("Imported 4 transaction(s), 2 duplicate(s) skipped");
  });
});
