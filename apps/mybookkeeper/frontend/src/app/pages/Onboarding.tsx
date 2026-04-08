import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/shared/utils/cn";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCompleteOnboardingMutation } from "@/shared/store/taxProfileApi";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import TaxSituationStep from "@/app/features/onboarding/TaxSituationStep";
import FilingStatusStep from "@/app/features/onboarding/FilingStatusStep";
import DependentsStep from "@/app/features/onboarding/DependentsStep";
import { STEP_LABELS, TOTAL_STEPS, INITIAL_ONBOARDING_DATA } from "@/shared/lib/onboarding-config";

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState(INITIAL_ONBOARDING_DATA);
  const [completeOnboarding, { isLoading }] = useCompleteOnboardingMutation();

  const canProceed =
    step === 0
      ? data.tax_situations.length > 0
      : step === 1
      ? data.filing_status !== null
      : true;

  async function handleNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep((prev) => prev + 1);
      return;
    }

    if (!data.filing_status) return;

    try {
      await completeOnboarding({
        tax_situations: data.tax_situations,
        filing_status: data.filing_status,
        dependents_count: data.dependents_count,
      }).unwrap();
      showSuccess("You're all set! Let's get started.");
      navigate("/");
    } catch {
      showError("Something went wrong. Want to try again?");
    }
  }

  function handleBack() {
    setStep((prev) => prev - 1);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4 py-8">
      <div className="bg-card border rounded-lg shadow-sm w-full max-w-lg">
        <div className="p-6 pb-0">
          <h1 className="text-2xl font-semibold mb-1">MyBookkeeper</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Let me ask you a few quick questions so I can set things up correctly for you.
          </p>

          <div className="flex items-center gap-2 mb-6">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      i < step
                        ? "bg-primary text-primary-foreground"
                        : i === step
                        ? "border-2 border-primary text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i < step ? (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-xs hidden sm:block",
                      i === step ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-px",
                      i < step ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Step {step + 1} of {TOTAL_STEPS}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-6">
          {step === 0 && (
            <TaxSituationStep
              value={data.tax_situations}
              onChange={(tax_situations) => setData((prev) => ({ ...prev, tax_situations }))}
            />
          )}
          {step === 1 && (
            <FilingStatusStep
              value={data.filing_status}
              onChange={(filing_status) => setData((prev) => ({ ...prev, filing_status }))}
            />
          )}
          {step === 2 && (
            <DependentsStep
              value={data.dependents_count}
              onChange={(dependents_count) => setData((prev) => ({ ...prev, dependents_count }))}
            />
          )}

          <div className="flex items-center justify-between pt-2">
            {step > 0 ? (
              <Button variant="secondary" onClick={handleBack} disabled={isLoading}>
                Back
              </Button>
            ) : (
              <div />
            )}
            <LoadingButton
              onClick={handleNext}
              disabled={!canProceed}
              isLoading={isLoading}
              loadingText={step === TOTAL_STEPS - 1 ? "Setting up..." : undefined}
            >
              {step === TOTAL_STEPS - 1 ? "Finish setup" : "Next"}
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
}
