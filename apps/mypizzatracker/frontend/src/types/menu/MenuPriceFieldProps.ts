export interface MenuPriceFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  required?: boolean;
}
