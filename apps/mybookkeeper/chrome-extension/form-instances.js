/** @typedef {{ field_name: string; line: string; value: string | number }} FormField */
/** @typedef {{ id: string; documentId?: string; label: string; fields: FormField[] }} FieldGroup */

/**
 * The API's form instances as the side panel's field groups: masked values
 * dropped, the payer added as a field, and a label that tells them apart.
 * @param {{ instance_id: string; document_id?: string; instance_label?: string; issuer_name?: string; fields?: { field_id: string; label?: string; value: string | number }[] }[]} instances
 * @returns {FieldGroup[]}
 */
function toFieldGroups(instances) {
  return instances.map((inst) => {
    const issuer = inst.instance_label || inst.issuer_name || null;
    const rawFields = inst.fields ?? [];
    const fields = rawFields
      .filter((f) => f.value !== "[REDACTED]" && f.value !== "***")
      .map((f) => ({
        field_name: f.label ?? f.field_id,
        line: f.field_id,
        value: f.value,
      }));
    // Add issuer/payer name as a field so it can be copied and auto-filled
    if (issuer) {
      fields.unshift({ field_name: "Payer / Financial Institution", line: "payer_name", value: issuer });
    }
    // Build a distinguishing label — add address or account number if name isn't unique
    const address = rawFields.find((f) => f.field_id === "box_8")?.value;
    const account = rawFields.find((f) => f.field_id === "account_number")?.value;
    let label = issuer || "Unknown";
    if (address && typeof address === "string") {
      label += ` — ${address}`;
    } else if (account) {
      label += ` — Acct ${String(account).slice(-6)}`;
    }
    return { id: inst.instance_id, documentId: inst.document_id, label, fields };
  }).filter((g) => g.fields.length > 0);
}
