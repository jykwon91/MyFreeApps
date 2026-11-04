/** An extension can't go in a tel: link, so it's dropped, and only a leading + survives. */
function dialablePhone(phone: string | null): string {
  const number = (phone ?? "").trim().replace(/\s*(?:ext\.?|x)\s*\d+$/i, "");
  const digits = number.replace(/\D/g, "");
  return digits && number.startsWith("+") ? `+${digits}` : digits;
}

export function contactLinks(name: string, email: string | null, phone: string | null): { label: string; spoken: string; url: string }[] {
  const dialable = dialablePhone(phone);
  const address = email?.trim() ?? "";
  return [
    ...(dialable
      ? [
          { label: `Call ${phone}`, spoken: `Call ${name}, ${phone}`, url: `tel:${dialable}` },
          { label: `Text ${phone}`, spoken: `Text ${name}, ${phone}`, url: `sms:${dialable}` },
        ]
      : []),
    ...(address ? [{ label: `Email ${address}`, spoken: `Email ${name}, ${address}`, url: `mailto:${encodeURIComponent(address)}` }] : []),
  ];
}
