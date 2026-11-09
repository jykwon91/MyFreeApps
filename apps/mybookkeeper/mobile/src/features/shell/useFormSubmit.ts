import { useRef, useState } from "react";

export interface FormSubmit {
  isBusy: boolean;
  failure: string | null;
  clearFailure: () => void;
  /** Runs one save at a time. Resolves true when it landed; on a failure it sets the message and resolves false. */
  submit: (save: () => Promise<unknown>, describeFailure: (error: unknown) => string) => Promise<boolean>;
}

/** Two taps in one frame get past a disabled button, so a ref refuses the second before React re-renders. */
export function useFormSubmit(): FormSubmit {
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isSubmitting = useRef(false);

  async function submit(save: () => Promise<unknown>, describeFailure: (error: unknown) => string): Promise<boolean> {
    if (isSubmitting.current) return false;
    isSubmitting.current = true;
    setIsBusy(true);
    setFailure(null);
    try {
      await save();
      return true;
    } catch (error) {
      setFailure(describeFailure(error));
      return false;
    } finally {
      isSubmitting.current = false;
      setIsBusy(false);
    }
  }

  return { isBusy, failure, clearFailure: () => setFailure(null), submit };
}
