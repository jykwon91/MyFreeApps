import type { AddApplicationReading } from "./AddApplicationReading";
import type { AddApplicationSource } from "./AddApplicationSource";

export interface SourceStepProps {
  source: AddApplicationSource;
  onSourceChange: (source: AddApplicationSource) => void;
  urlValue: string;
  onUrlChange: (url: string) => void;
  /** Reads `url`, or the typed link when none is given. */
  onReadLink: (url?: string) => Promise<void>;
  onPasteLink: () => Promise<void>;
  textValue: string;
  onTextChange: (text: string) => void;
  /** Why the pasted text can't be read as it is. */
  textError: string | null;
  onReadText: () => Promise<void>;
  onChooseCompany: () => void;
  reading: AddApplicationReading;
  isLongRunning: boolean;
}
