/** What a tool returned, sent back to Claude: compact JSON text, at most 4 KB. */
export interface ChatToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error: boolean;
}
