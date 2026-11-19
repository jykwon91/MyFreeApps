import { describe, it, expect } from "vitest";
import { useDashboardHeaderMode } from "@/app/features/dashboard/useDashboardHeaderMode";
import type { HealthSummary } from "@/shared/types/health/health-summary";
import type { DateRange } from "@/shared/types/dashboard/date-range";

// ---- useDashboardHeaderMode ----

const dateRange: DateRange = { startDate: "2025-01-01", endDate: "2025-01-31" };
const unhealthySummary: HealthSummary = {
  status: "degraded",
  active_problems: [],
  stats: {
    documents_processing: 0,
    documents_failed: 3,
    documents_retry_pending: 0,
    extractions_today: 0,
    corrections_today: 0,
    api_tokens_today: 0,
  },
  recent_events: [],
};
const healthySummary: HealthSummary = { ...unhealthySummary, status: "healthy" };

describe("useDashboardHeaderMode", () => {
  describe("subtitle mode", () => {
    it('returns "date-range" when dateRange is set', () => {
      const { subtitle } = useDashboardHeaderMode({
        dateRange,
        healthSummary: unhealthySummary,
        byMonthLength: 2,
      });
      expect(subtitle).toBe("date-range");
    });

    it('returns "health-warning" when no dateRange and health is degraded', () => {
      const { subtitle } = useDashboardHeaderMode({
        dateRange: undefined,
        healthSummary: unhealthySummary,
        byMonthLength: 2,
      });
      expect(subtitle).toBe("health-warning");
    });

    it('returns "none" when no dateRange and health is healthy', () => {
      const { subtitle } = useDashboardHeaderMode({
        dateRange: undefined,
        healthSummary: healthySummary,
        byMonthLength: 2,
      });
      expect(subtitle).toBe("none");
    });

    it('returns "none" when no dateRange and no healthSummary', () => {
      const { subtitle } = useDashboardHeaderMode({
        dateRange: undefined,
        healthSummary: undefined,
        byMonthLength: 2,
      });
      expect(subtitle).toBe("none");
    });
  });

  describe("actions mode", () => {
    it('returns "reset" when dateRange is set', () => {
      const { actions } = useDashboardHeaderMode({
        dateRange,
        healthSummary: undefined,
        byMonthLength: 0,
      });
      expect(actions).toBe("reset");
    });

    it('returns "hint" when no dateRange and there are months', () => {
      const { actions } = useDashboardHeaderMode({
        dateRange: undefined,
        healthSummary: undefined,
        byMonthLength: 3,
      });
      expect(actions).toBe("hint");
    });

    it('returns "none" when no dateRange and no months', () => {
      const { actions } = useDashboardHeaderMode({
        dateRange: undefined,
        healthSummary: undefined,
        byMonthLength: 0,
      });
      expect(actions).toBe("none");
    });
  });
});
