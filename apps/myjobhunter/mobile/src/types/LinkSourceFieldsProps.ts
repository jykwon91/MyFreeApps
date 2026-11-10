export interface LinkSourceFieldsProps {
  value: string;
  onChange: (url: string) => void;
  onRead: () => Promise<void>;
  onPaste: () => Promise<void>;
  isReading: boolean;
  /** Something else is being read, so this waits. */
  disabled: boolean;
  isLongRunning: boolean;
}
