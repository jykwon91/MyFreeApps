const TYPE_MEANWHILE = "You can keep practicing by typing in the meantime.";

/** What the website says when the browser has blocked the microphone (the phone words this itself). */
export const MIC_DENIED_COPY = {
  /** The browser tells us when access changes, so the learner needn't do anything after allowing it. */
  allow: `To practice speaking, allow microphone access for this site in your browser. Speaking comes back as soon as you do. ${TYPE_MEANWHILE}`,
  /** This browser can't tell us, so the learner has to reload. */
  allowThenReload: `To practice speaking, allow microphone access for this site in your browser, then reload. ${TYPE_MEANWHILE}`,
} as const;
