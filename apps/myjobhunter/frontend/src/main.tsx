import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { setupListeners } from "@reduxjs/toolkit/query";
import { installStaleChunkRecovery } from "@platform/ui";
import App from "./App";
import { store } from "./lib/store";
import "./index.css";

// A tab opened before a deploy can't load the new build's lazy chunks —
// reload once onto the new build (guarded so it can never loop).
installStaleChunkRecovery();

// Activates baseApi's refetchOnFocus / refetchOnReconnect. Without this call
// both options are inert and the app serves stale cache after a tab regains focus.
setupListeners(store.dispatch);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
