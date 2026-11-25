/** A sender whose payments are always marked personal transfers, so they skip Payment Review. */
export interface PersonalTransferSender {
  id: string;
  display_name: string;
  /** The Zelle email or phone, Venmo name and so on; "" when the payment showed none. */
  payer_handle: string;
}
