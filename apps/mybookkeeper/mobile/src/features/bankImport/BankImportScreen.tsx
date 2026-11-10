import { BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import RequireWrite from "../workspace/RequireWrite";
import WriteAccessSkeleton from "../workspace/WriteAccessSkeleton";
import BankImportBody from "./BankImportBody";

/** Brings a bank's CSV in from the phone. A viewer is told they can't. */
export default function BankImportScreen() {
  return (
    <RequireWrite body={MESSAGES.viewOnly} heading={MESSAGES.title} loading={<WriteAccessSkeleton />}>
      <BankImportBody />
    </RequireWrite>
  );
}
