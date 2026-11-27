import type { RegisterNameField } from "./RegisterNameField";

export interface RegisterDetails {
  email: string;
  password: string;
  /** Left out of the request when blank, so the backend keeps its own default. */
  name: string;
  nameField: RegisterNameField;
}
