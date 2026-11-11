export interface ResumeCustomSheetProps {
  isOpen: boolean;
  value: string;
  onChange: (text: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
  failure: string | null;
}
