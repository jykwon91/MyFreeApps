import type { APIRequestContext } from "@playwright/test";

interface TransactionInput {
  vendor?: string;
  amount: string;
  transaction_type: "income" | "expense";
  category: string;
  transaction_date: string;
  property_id?: string;
  tax_relevant?: boolean;
}

interface PropertyInput {
  name: string;
  address?: string;
  type?: "short_term" | "long_term";
}

interface CreatedRecord {
  id: string;
  [key: string]: unknown;
}

export async function createTransaction(
  api: APIRequestContext,
  overrides: Partial<TransactionInput> = {},
): Promise<CreatedRecord> {
  const defaults: TransactionInput = {
    vendor: "E2E Test Vendor",
    amount: "100.00",
    transaction_type: "expense",
    category: "maintenance",
    transaction_date: "2025-01-15",
    tax_relevant: false,
  };
  const res = await api.post("/transactions", { data: { ...defaults, ...overrides } });
  if (!res.ok()) throw new Error(`createTransaction failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function createProperty(
  api: APIRequestContext,
  overrides: Partial<PropertyInput> = {},
): Promise<CreatedRecord> {
  const defaults: PropertyInput = {
    name: "E2E Test Property",
    address: "123 Test St, Austin, TX 78701",
    type: "short_term",
  };
  const res = await api.post("/properties", { data: { ...defaults, ...overrides } });
  if (!res.ok()) throw new Error(`createProperty failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function deleteTransaction(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/transactions/${id}`).catch(() => {});
}

export async function deleteProperty(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/properties/${id}`).catch(() => {});
}
