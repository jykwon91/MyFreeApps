export interface FormCompleteness {
  form_name: string;
  instance_label: string | null;
  filled_fields: string[];
  missing_fields: string[];
  total_expected: number;
  total_filled: number;
  highlights: string[];
}
