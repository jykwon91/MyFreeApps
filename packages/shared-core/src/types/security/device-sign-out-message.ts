/** What to tell the user once signing a device out has ended. */
export interface DeviceSignOutMessage {
  message: string;
  variant: "success" | "error";
}
