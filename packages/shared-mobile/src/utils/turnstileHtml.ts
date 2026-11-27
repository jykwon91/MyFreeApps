import { TURNSTILE_PAGE_CSP, TURNSTILE_SCRIPT_URL } from "../constants/turnstile";
import { scriptLiteral } from "./scriptLiteral";

/**
 * The page the captcha WebView shows: Cloudflare's script, rendered explicitly into one element, reporting back with
 * `window.ReactNativeWebView.postMessage`. The site key and theme go in as one script literal, never as markup.
 */
export function turnstileHtml(siteKey: string, isDark: boolean): string {
  const config = scriptLiteral({ sitekey: siteKey, theme: isDark ? "dark" : "light", scriptUrl: TURNSTILE_SCRIPT_URL });
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="${TURNSTILE_PAGE_CSP}">
<style>html,body{margin:0;padding:0;background:transparent;}body{display:flex;justify-content:center;}</style>
</head>
<body>
<div id="challenge"></div>
<script>
(function () {
  var config = ${config};
  function send(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function render() {
    window.turnstile.render("#challenge", {
      sitekey: config.sitekey,
      theme: config.theme,
      callback: function (token) { send({ type: "token", token: token }); },
      "expired-callback": function () { send({ type: "expired" }); },
      "timeout-callback": function () { send({ type: "expired" }); },
      "error-callback": function (code) { send({ type: "error", code: String(code) }); }
    });
    send({ type: "ready" });
  }
  var script = document.createElement("script");
  script.src = config.scriptUrl;
  script.onload = render;
  script.onerror = function () { send({ type: "error", code: "script_load_failed" }); };
  document.head.appendChild(script);
})();
</script>
</body>
</html>`;
}
