export interface CompanyPickerRowProps {
  label: string;
  /** A second line, like the company's website. */
  detail?: string | null;
  onPress: () => void;
  disabled?: boolean;
}
