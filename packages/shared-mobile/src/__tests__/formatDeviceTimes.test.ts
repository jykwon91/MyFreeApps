import { formatLastUsed, formatSignedInDate } from "../utils/formatDeviceTimes";
import { deviceDisplayName } from "../utils/deviceName";

const NOW = new Date("2026-11-03T12:00:00Z");

describe("formatLastUsed", () => {
  it.each([
    ["2026-11-03T11:59:30Z", "Last used just now"],
    ["2026-11-03T11:59:00Z", "Last used 1 minute ago"],
    ["2026-11-03T11:15:00Z", "Last used 45 minutes ago"],
    ["2026-11-03T11:00:00Z", "Last used 1 hour ago"],
    ["2026-11-03T02:00:00Z", "Last used 10 hours ago"],
    ["2026-11-02T12:00:00Z", "Last used 1 day ago"],
    ["2026-10-04T12:00:00Z", "Last used 30 days ago"],
  ])("%s reads %s", (iso, expected) => {
    expect(formatLastUsed(iso, NOW)).toBe(expected);
  });

  it("treats a clock slightly ahead of the phone's as just now", () => {
    expect(formatLastUsed("2026-11-03T12:00:30Z", NOW)).toBe("Last used just now");
  });
});

it("formats the sign-in date with its year", () => {
  expect(formatSignedInDate("2026-10-15T12:00:00Z")).toMatch(/^Signed in .*2026/);
});

it("names a device with no name", () => {
  const device = { id: "1", created_at: "", last_used_at: "" };
  expect(deviceDisplayName({ ...device, device_name: null })).toBe("Unknown device");
  expect(deviceDisplayName({ ...device, device_name: "  " })).toBe("Unknown device");
  expect(deviceDisplayName({ ...device, device_name: "Pixel" })).toBe("Pixel");
});
