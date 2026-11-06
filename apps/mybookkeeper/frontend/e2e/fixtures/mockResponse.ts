/** A JSON answer for page.route() in no-backend specs. */
export const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
