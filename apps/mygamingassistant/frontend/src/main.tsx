import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { installStaleChunkRecovery } from "@platform/ui";
import {
  DiscordActivityGate,
  DiscordActivityProvider,
  installDiscordUrlRemap,
  loadDiscordActivityClientId,
} from "@platform/ui/discord-activity";
import api from "@/lib/api";
import { store } from "@/lib/store";
import { MGA_DISCORD_URL_MAPPINGS } from "@/constants/discordActivity";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

// A tab opened before a deploy can't load the new build's lazy chunks —
// reload once onto the new build (guarded so it can never loop).
installStaleChunkRecovery();

// Discord Activity (opened from Discord's App Launcher): API media URLs are
// rewritten onto the URL Mappings so they load through Discord's proxy, and the
// app waits for the Discord handshake before it renders. On the website both
// are no-ops — the Discord SDK is never downloaded.
installDiscordUrlRemap(api, MGA_DISCORD_URL_MAPPINGS);

createRoot(rootEl).render(
  <StrictMode>
    <Provider store={store}>
      <DiscordActivityProvider loadClientId={loadDiscordActivityClientId} urlMappings={MGA_DISCORD_URL_MAPPINGS}>
        <DiscordActivityGate>
          <App />
        </DiscordActivityGate>
      </DiscordActivityProvider>
    </Provider>
  </StrictMode>,
);
