import { OptionSheet } from "@platform/mobile";
import { useState } from "react";
import { PAYMENT_METHOD_OPTIONS, RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import PickerField from "../transactions/PickerField";
import { paymentMethodLabel } from "./receiptDisplay";

interface PaymentMethodRowProps {
  value: string;
  /** The method guessed from the payment, or empty when there was nothing to go on. */
  guess: string;
  onChange: (method: string) => void;
}

export default function PaymentMethodRow({ value, guess, onChange }: PaymentMethodRowProps) {
  const [isPicking, setIsPicking] = useState(false);
  const isGuess = guess !== "" && value === guess;
  return (
    <>
      <PickerField hint={isGuess ? MESSAGES.guessedMethod : undefined} label={MESSAGES.howTheyPaid} onPress={() => setIsPicking(true)} value={paymentMethodLabel(value)} />
      <OptionSheet
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(method) => {
          setIsPicking(false);
          onChange(method);
        }}
        options={PAYMENT_METHOD_OPTIONS}
        title={MESSAGES.methodSheetTitle}
        value={value}
      />
    </>
  );
}
