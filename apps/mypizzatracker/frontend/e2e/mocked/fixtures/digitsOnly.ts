/** A phone as customer_service.normalize_phone stores it: its digits only. */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D+/g, "");
}
