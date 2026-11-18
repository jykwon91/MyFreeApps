/**
 * For an add whose outcome is unknown (see writeOutcome): the server may have saved it before the answer was lost or it broke,
 * so trying again blindly could make two. `checkWhere` reads after "Check", like "your documents".
 */
export function unsureSavedMessage(checkWhere: string, lostConnection: boolean): string {
  const unsure = lostConnection ? "I lost the connection, so I'm not sure that saved." : "I'm not sure that saved.";
  return `${unsure} Check ${checkWhere} before trying again, so you don't end up with two.`;
}
