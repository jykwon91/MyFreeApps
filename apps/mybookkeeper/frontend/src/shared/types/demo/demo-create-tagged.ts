import type { DemoCredentials } from "./demo-status";

export interface DemoCreateTaggedRequest {
  tag: string;
  recipient_email?: string;
}

export interface DemoCreateTaggedResponse {
  message: string;
  credentials: DemoCredentials;
  email_sent: boolean;
}
