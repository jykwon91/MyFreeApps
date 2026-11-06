/** How filling in the picked reply template is going, and its Try again. */
export interface ReplyTemplateRenderState {
  isFetching: boolean;
  failed: boolean;
  onRetry: () => void;
}
