export interface TextSourceFieldsProps {
  value: string;
  /** Why it can't be read as it is, shown under the field. */
  error: string | null;
  onChange: (text: string) => void;
  onRead: () => Promise<void>;
  isReading: boolean;
  isLongRunning: boolean;
}
