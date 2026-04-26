export interface CostSummary {
  today: number;
  this_week: number;
  this_month: number;
  total_tokens_today: number;
  extractions_today: number;
}

export interface UserCost {
  user_id: string;
  email: string;
  cost: number;
  tokens: number;
  extractions: number;
}

export interface DailyCost {
  date: string;
  cost: number;
  input_cost: number;
  output_cost: number;
  tokens: number;
  extractions: number;
}

export interface CostThresholds {
  daily_budget: number;
  monthly_budget: number;
  per_user_daily_alert: number;
  input_rate_per_million: number;
  output_rate_per_million: number;
}
