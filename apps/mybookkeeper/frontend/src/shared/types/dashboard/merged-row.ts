export interface MergedRow {
  displayMonth: string;
  rawMonth: string;
  revenue: number;
  profit: number;
  [key: string]: string | number;
}
