import type { AddApplicationFormProblems } from "@myjobhunter/api-client/types/application/add-application-form-problems";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import type { AddApplicationReview } from "./AddApplicationReview";

export interface ReviewStepProps {
  review: AddApplicationReview;
  values: AddApplicationFormValues;
  errors: AddApplicationFormProblems;
  onEdit: <Field extends keyof AddApplicationFormValues>(field: Field, value: AddApplicationFormValues[Field]) => void;
  onChangeCompany: () => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  /** Saved, and on the way back to the list. */
  isLocked: boolean;
}
