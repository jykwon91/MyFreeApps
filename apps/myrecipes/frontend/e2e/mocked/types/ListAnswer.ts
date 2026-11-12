/** What a stubbed GET /recipes answers: a JSON body and, unless 200, a status. */
export interface ListAnswer {
  body: unknown;
  status?: number;
}
