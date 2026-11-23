const CANT_RECEIVE_TEXTS = "That number can't receive texts. Check it with the tenant, or use email";

/** What happened and what to do next, for the Twilio error numbers a rent reminder text most
 *  often fails with. Any other number is shown with a link to Twilio's page for it. */
export const TWILIO_ERROR_LABEL: ReadonlyMap<string, string> = new Map(Object.entries({
  "20003": "Twilio didn't accept the server's account SID or auth token, so no text can go out until they're fixed on the server",
  "21211": "The phone number isn't valid. Fix it on the tenant's record",
  "21408": "Texting that country isn't turned on in your Twilio account. Turn it on in the Twilio console's messaging geo permissions, or use email",
  "21608": "A Twilio trial account can only text numbers verified in the Twilio console. Verify this number there, or upgrade the account",
  "21610": "The tenant replied STOP, so texts to them are blocked. Use email, or ask them to text START to your Twilio number",
  "21614": CANT_RECEIVE_TEXTS,
  "30003": "The tenant's phone was off or out of reach. Try again later",
  "30005": CANT_RECEIVE_TEXTS,
  "30006": CANT_RECEIVE_TEXTS,
  "30007": "The carrier blocked it as possible spam. Check your toll-free number's verification in the Twilio console, or use email",
  "30032": "Your toll-free number isn't verified yet, so carriers block its texts. Check its verification status in the Twilio console",
}));
