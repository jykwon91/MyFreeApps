/**
 * Which problems to look for. `lengthsOnly` is for while typing: a field past its limit says so
 * straight away, as its counter turns red, while "required" waits for Create to be pressed.
 */
export interface RecipeProblemScope {
  lengthsOnly?: boolean;
}
