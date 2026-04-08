export interface ActiveProblem {
  type: string;
  count: number;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
}

export interface HealthStats {
  documents_processing: number;
  documents_failed: number;
  documents_retry_pending: number;
  extractions_today: number;
  corrections_today: number;
  api_tokens_today: number;
}

export interface SystemEvent {
  id: string;
  organization_id: string | null;
  event_type: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  event_data: Record<string, unknown> | null;
  resolved: boolean;
  created_at: string;
}

export interface HealthSummary {
  status: "healthy" | "degraded" | "unhealthy";
  active_problems: ActiveProblem[];
  stats: HealthStats;
  recent_events: SystemEvent[];
}
