export interface LoginPasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: "current-password" | "new-password";
  disabled: boolean;
  helperId: string;
  /** Set on the create-account form: shows "At least N characters", ticked once met. */
  minLength?: number;
}
