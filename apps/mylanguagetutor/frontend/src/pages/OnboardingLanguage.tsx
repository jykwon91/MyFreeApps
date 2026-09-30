import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useListLanguagesQuery } from "@/store/catalogApi";
import CatalogError from "@/features/catalog/CatalogError";
import PageSkeleton from "@/features/onboarding/PageSkeleton";

/** Onboarding step 1: which language to practice. */
export default function OnboardingLanguage() {
  const { data: languages, isError, refetch } = useListLanguagesQuery();

  let body;
  if (isError) body = <CatalogError onRetry={() => void refetch()} />;
  else if (!languages) body = <PageSkeleton />;
  else if (languages.length === 0) {
    body = <p className="text-sm text-muted-foreground">No languages are available yet.</p>;
  } else {
    body = (
      <ul className="space-y-3">
        {languages.map((language) => (
          <li key={language.code}>
            <Link
              to={`/onboarding/level?language=${encodeURIComponent(language.code)}`}
              className="flex min-h-[44px] items-center justify-between rounded-lg border bg-card p-4 hover:bg-muted"
            >
              <span>
                <span className="block font-medium">{language.display_name}</span>
                <span className="block text-sm text-muted-foreground">{language.dialect_label}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Step 1 of 2</p>
        <h1 className="text-2xl font-semibold">What would you like to practice?</h1>
        <p className="text-sm text-muted-foreground">
          You'll have short spoken conversations with an AI tutor. You can change this later.
        </p>
      </div>
      {body}
    </div>
  );
}
