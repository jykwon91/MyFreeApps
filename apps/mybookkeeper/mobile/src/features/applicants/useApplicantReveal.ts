import { useRevealApplicantSensitiveMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import type { ApplicantSensitive } from "@mybookkeeper/api-client/types/applicant/applicant-sensitive";
import { applicantRevealFailure } from "@mybookkeeper/api-client/utils/applicantRevealFailure";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { REVEAL_HIDES_AFTER_MS, REVEAL_MESSAGES } from "../../constants/applicantReveal";
import { httpStatus } from "../transactions/transactionMessages";
import { confirmOwner } from "./confirmOwner";

export interface ApplicantReveal {
  details: ApplicantSensitive | undefined;
  hide: () => void;
  isBusy: boolean;
  problem: string | null;
  show: () => Promise<void>;
}

function revealProblem(error: unknown): string {
  return httpStatus(error) === undefined ? REVEAL_MESSAGES.offline : applicantRevealFailure(error);
}

/** The answer lives only in this hook's mutation, in memory, and goes as soon as it's hidden. */
export function useApplicantReveal(id: string): ApplicantReveal {
  const [reveal, { data: details, error, isLoading, reset }] = useRevealApplicantSensitiveMutation();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmProblem, setConfirmProblem] = useState<string | null>(null);
  // `reset` changes with each request. Going away has to clear whichever one is current.
  const latestReset = useRef(reset);
  useEffect(() => {
    latestReset.current = reset;
  }, [reset]);
  const isFocused = useRef(false);
  const isShowing = useRef(false);
  const hide = useCallback(() => {
    latestReset.current();
    setConfirmProblem(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      return () => {
        isFocused.current = false;
        hide();
      };
    }, [hide]),
  );

  useEffect(() => {
    if (!details) return undefined;
    // They may have left while it was on its way, with nothing left to trigger a hide.
    // Not "inactive": iOS can still be there for a moment after the Face ID prompt closes.
    const stillHere = isFocused.current && AppState.currentState !== "background";
    // Backgrounded timers can stall, so backgrounding has its own hide below.
    const timer = setTimeout(hide, stillHere ? REVEAL_HIDES_AFTER_MS : 0);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") hide();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [details, hide]);

  const show = useCallback(async () => {
    // Two taps in one frame get past the disabled button, and each reveal is an audit record.
    if (isShowing.current) return;
    isShowing.current = true;
    setConfirmProblem(null);
    latestReset.current();
    setIsConfirming(true);
    const { confirmed, problem } = await confirmOwner();
    setIsConfirming(false);
    if (isFocused.current) {
      setConfirmProblem(problem);
      if (confirmed) await reveal(id);
    }
    isShowing.current = false;
  }, [id, reveal]);

  return {
    details,
    hide,
    isBusy: isConfirming || isLoading,
    problem: confirmProblem ?? (error ? revealProblem(error) : null),
    show,
  };
}
