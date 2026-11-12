/** Where the transcript will be, before the first turn. */
export function startConversationPrompt(languageName: string): string {
  return `Say hello in ${languageName} to start the conversation.`;
}
