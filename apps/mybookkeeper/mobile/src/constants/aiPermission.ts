export const AI_PERMISSION_FILE = "ai-permission.json";
/** Raise this when what goes to the AI changes, so everyone is asked again. */
export const AI_PERMISSION_VERSION = 1;
export const PRIVACY_POLICY_PATH = "/privacy";

export const AI_PERMISSION_ASK_TITLE = "Let Claude read your documents?";
export const AI_PERMISSION_ALLOWED_TITLE = "Claude reads your documents";
export const AI_PERMISSION_WHAT_IS_SENT =
  "To read a receipt or invoice, I save your photo or PDF to your MyBookkeeper account and send it to Claude, an AI made by Anthropic. It can include names, addresses and amounts.";
export const AI_PERMISSION_LIMITS =
  "From this phone, I only send files you add or ask me to read again. We use Anthropic's standard API and haven't opted in to any data-training program.";
export const AI_PERMISSION_NOT_ALLOWED_STATE =
  "I won't send your documents to Claude unless you allow it. You can change this any time in More.";
export const AI_PERMISSION_ALLOWED_STATE =
  "This is allowed on this phone. If you stop, I won't send new files, and that doesn't take back what I've already sent.";
export const AI_PERMISSION_NOT_COVERED =
  "This choice doesn't cover two things. If you connected Gmail on the website, I read those emails and attachments with Claude. To stop that, disconnect Gmail there. Messages from your public inquiry form also get a spam check by Claude, with email addresses and phone numbers removed.";
