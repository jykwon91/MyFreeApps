import React from "react";
import ReactDOM from "react-dom/client";
import posthog from "posthog-js";
import App from "./App";
import "./index.css";

function reportFrontendError(payload: {
  message: string;
  stack?: string;
  url?: string;
  component?: string;
}) {
  const token = localStorage.getItem("token");
  if (!token) return;
  fetch("/api/errors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

window.addEventListener("error", (event) => {
  reportFrontendError({
    message: event.message,
    stack: event.error?.stack,
    url: event.filename,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportFrontendError({
    message: String(event.reason),
    stack: event.reason?.stack,
  });
});

if (import.meta.env.PROD) {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask]",
      },
    });
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);