import { describe, it, expect } from "vitest";
import { formatFileSize } from "../utils/file-size";

describe("formatFileSize", () => {
  // ---- null / undefined ----
  it("returns '' for null", () => {
    expect(formatFileSize(null)).toBe("");
  });

  it("returns '' for undefined", () => {
    expect(formatFileSize(undefined)).toBe("");
  });

  // ---- zero edge case ----
  it("returns '0 B' for 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  // ---- bytes range ----
  it("returns bytes with B suffix for values below 1024", () => {
    expect(formatFileSize(1)).toBe("1 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  // ---- kilobytes range ----
  it("returns KB with 1 decimal for values in [1024, 1048576)", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(102400)).toBe("100.0 KB");
    expect(formatFileSize(1048575)).toBe("1024.0 KB");
  });

  // ---- megabytes range ----
  it("returns MB with 1 decimal for values >= 1048576", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(2097152)).toBe("2.0 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });

  // ---- rounding behavior ----
  it("rounds to 1 decimal place for KB", () => {
    // 1500 bytes = 1.46484375 KB → rounds to 1.5 KB
    expect(formatFileSize(1500)).toBe("1.5 KB");
  });

  it("rounds to 1 decimal place for MB", () => {
    // 1.55 MB = 1.55 * 1024 * 1024 = 1625292.8 bytes
    expect(formatFileSize(1625293)).toBe("1.6 MB");
  });

  // ---- large files ----
  it("handles large files (> 100 MB) without crashing", () => {
    expect(formatFileSize(500 * 1024 * 1024)).toBe("500.0 MB");
  });
});
