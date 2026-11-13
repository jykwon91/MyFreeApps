import type { ValidationIssue } from "./ValidationIssue";

/** FastAPI's RequestValidationError answer (422). */
export interface ValidationErrorBody {
  detail: ValidationIssue[];
}
