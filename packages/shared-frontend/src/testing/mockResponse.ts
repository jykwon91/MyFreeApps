/** A JSON answer for page.route() in no-backend (fully mocked) E2E specs. For E2E tests only. */
export const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
