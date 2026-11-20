/** The Google sign-in address the fake servers hand out when asked to start connecting Gmail. */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/auth?state=signed";

export const GMAIL_CONNECT_URL = "/integrations/gmail/connect";

/** Where the app finishes the connection, signed in, with what Google's answer carried. */
export const GMAIL_COMPLETE_URL = "/integrations/gmail/complete";

/** Google's code and the signed state, as the server sends them on to the app. */
export const GOOGLE_ANSWER = { code: "c0de", state: "signed" } as const;
export const GOOGLE_ANSWER_QUERY = `code=${GOOGLE_ANSWER.code}&state=${GOOGLE_ANSWER.state}`;
