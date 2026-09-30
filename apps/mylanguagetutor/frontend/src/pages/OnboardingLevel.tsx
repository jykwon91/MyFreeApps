import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertBox, LoadingButton, cn } from "@platform/ui";
import { LEVEL_OPTIONS } from "@/features/onboarding/levelOptions";
import PageSkeleton from "@/features/onboarding/PageSkeleton";
import { useGetProfileQuery, useSaveProfileMutation } from "@/store/profileApi";
import type { Level } from "@/types/tutor/level";

/** Onboarding step 2 (and "Change level" later): how much the learner already knows. */
export default function OnboardingLevel() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: profile, isError: profileFailed } = useGetProfileQuery();
  const [saveProfile, { isLoading, isError }] = useSaveProfileMutation();
  const [picked, setPicked] = useState<Level | null>(null);
  const languageCode = params.get("language") ?? profile?.language_code ?? null;
  const selected = picked ?? profile?.level ?? null;

  if (!languageCode) {
    // Profile still loading: wait; no profile and no language chosen: step 1.
    if (profile === undefined && !profileFailed) return <PageSkeleton />;
    return <Navigate to="/onboarding/language" replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try {
      await saveProfile({ language_code: languageCode, level: selected }).unwrap();
      navigate("/scenarios", { replace: true });
    } catch {
      // isError renders the alert below
    }
  };

  return (
    <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        {!profile && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Step 2 of 2</p>
        )}
        <h1 className="text-2xl font-semibold">Where are you starting from?</h1>
        <p className="text-sm text-muted-foreground">
          The tutor adjusts how fast and how simply it speaks. You can change this any time.
        </p>
      </div>
      <fieldset className="space-y-3">
        <legend className="sr-only">Your level</legend>
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
              onChange={() => setPicked(option.value)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="block text-sm text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {isError && <AlertBox variant="error">Couldn't save your choice. Try again.</AlertBox>}
      <LoadingButton type="submit" isLoading={isLoading} loadingText="Saving" disabled={!selected}>
        Continue
      </LoadingButton>
    </form>
  );
}
