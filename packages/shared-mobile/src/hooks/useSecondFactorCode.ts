import { useCallback, useState } from "react";

const AUTHENTICATOR_CODE_LENGTH = 6;
const RECOVERY_CODE_LENGTH = 8;

export function useSecondFactorCode() {
  const [code, setCode] = useState("");
  const [usesRecoveryCode, setUsesRecoveryCode] = useState(false);
  const requiredLength = usesRecoveryCode ? RECOVERY_CODE_LENGTH : AUTHENTICATOR_CODE_LENGTH;

  function change(text: string): void {
    // Pasted codes often arrive as "123 456".
    const cleaned = usesRecoveryCode ? text.replace(/[^0-9a-zA-Z]/g, "").toUpperCase() : text.replace(/\D/g, "");
    setCode(cleaned.slice(0, requiredLength));
  }

  const clear = useCallback(() => setCode(""), []);

  function toggleRecoveryCode(): void {
    setCode("");
    setUsesRecoveryCode((current) => !current);
  }

  return { code, usesRecoveryCode, isComplete: code.length >= requiredLength, change, clear, toggleRecoveryCode };
}
