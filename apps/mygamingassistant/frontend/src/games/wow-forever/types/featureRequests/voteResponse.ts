/** `POST` / `DELETE /api/wow/feature-requests/{id}/vote`. */
export interface VoteResponse {
  /** Where the vote landed — differs from the tapped id when that story was merged into another. */
  story_id: string;
  voted: boolean;
  vote_count: number;
}
