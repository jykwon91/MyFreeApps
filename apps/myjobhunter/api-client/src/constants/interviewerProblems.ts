export function tooManyInterviewersMessage(max: number): string {
  return `List up to ${max} interviewers.`;
}

export function interviewerNameTooLongMessage(max: number): string {
  return `Keep each name to ${max} characters.`;
}
