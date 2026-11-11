import {
  ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS,
  LOCATION_MAX_LENGTH,
  ROLE_TITLE_MAX_LENGTH,
} from "../constants/addApplicationForm";
import { APPLICATION_NOTES_MAX_LENGTH } from "../constants/textFieldLimits";
import type { AddApplicationFormProblems } from "../types/application/add-application-form-problems";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import { textLength } from "./textLength";

/** What stops the form saving, checked against what is sent (trimmed). Empty when it can be saved. */
export function addApplicationFormProblems(values: AddApplicationFormValues): AddApplicationFormProblems {
  const problems: AddApplicationFormProblems = {};
  const roleTitle = values.role_title.trim();
  if (!roleTitle) problems.role_title = PROBLEMS.roleTitleRequired;
  else if (textLength(roleTitle) > ROLE_TITLE_MAX_LENGTH) problems.role_title = PROBLEMS.roleTitleTooLong;
  if (textLength(values.location.trim()) > LOCATION_MAX_LENGTH) problems.location = PROBLEMS.locationTooLong;
  if (textLength(values.notes.trim()) > APPLICATION_NOTES_MAX_LENGTH) problems.notes = PROBLEMS.notesTooLong;
  return problems;
}
