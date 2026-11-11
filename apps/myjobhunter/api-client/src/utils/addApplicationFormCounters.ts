import { LOCATION_MAX_LENGTH, ROLE_TITLE_MAX_LENGTH } from "../constants/addApplicationForm";
import { APPLICATION_NOTES_MAX_LENGTH } from "../constants/textFieldLimits";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import type { CharacterCounters } from "../types/character-counters";
import { countersFor } from "./countersFor";

export function addApplicationFormCounters(values: AddApplicationFormValues): CharacterCounters<keyof AddApplicationFormValues> {
  return countersFor(values, {
    role_title: ROLE_TITLE_MAX_LENGTH,
    location: LOCATION_MAX_LENGTH,
    notes: APPLICATION_NOTES_MAX_LENGTH,
  });
}
