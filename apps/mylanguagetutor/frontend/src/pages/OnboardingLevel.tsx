import type { FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertBox, LoadingButton, cn } from "@platform/ui";
import { LEVEL_OPTIONS } from "@mylanguagetutor/api-client/constants/levelOptions";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import { ONBOARDING_LANGUAGE_PATH } from "@mylanguagetutor/api-client/constants/onboardingLanguagePath";
import { useLevelChoice } from "@mylanguagetutor/api-client/hooks/useLevelChoice";
import PageSkeleton from "@/features/onboarding/PageSkeleton";

/** Onboarding step 2 (and "Change level" later): how much the learner already knows. */
export default function OnboardingLevel() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { languageCode, selected, pick, isProfilePending, isFirstTime, isSaving, isSaveError, save } = useLevelChoice(
    params.get("language"),
  );

  if (!languageCode) {
    // Profile still loading: wait; no profile and no language chosen: step 1.
    if (isProfilePending) return <PageSkeleton />;
    return <Navigate to={ONBOARDING_LANGUAGE_PATH} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await save()) navigate("/scenarios", { replace: true });
  };

  return (
    <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        {isFirstTime && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ONBOARDING_COPY.levelStep}</p>
        )}
        <h1 className="text-2xl font-semibold">{ONBOARDING_COPY.levelHeading}</h1>
        <p className="text-sm text-muted-foreground">{ONBOARDING_COPY.levelIntro}</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="sr-only">{ONBOARDING_COPY.levelLegend}</legend>
        {LEVEL_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 hover:bg-muted",
              selected === option.value && "border-primary ring-1 ring-primary",
            )}
          >
            <input
              type="radio"
              name="level"
              value={option.value}
              checked={selected === option.value}
              onChange={() => pick(option.value)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="block text-sm text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {isSaveError && <AlertBox variant="error">{ONBOARDING_COPY.saveFailed}</AlertBox>}
      <LoadingButton type="submit" isLoading={isSaving} loadingText={ONBOARDING_COPY.saving} disabled={!selected}>
        {ONBOARDING_COPY.continue}
      </LoadingButton>
    </form>
  );
}
