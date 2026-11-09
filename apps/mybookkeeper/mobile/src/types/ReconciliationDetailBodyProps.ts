import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";

export interface ReconciliationDetailBodyProps {
  source: ReconciliationSource;
  canWrite: boolean;
}
