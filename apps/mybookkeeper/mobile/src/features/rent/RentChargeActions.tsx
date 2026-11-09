import { useDeleteRentChargeMutation, useUnwaiveRentChargeMutation } from "@mybookkeeper/api-client/store/rentLedgerApi";
import type { RentCharge } from "@mybookkeeper/api-client/types/rent/rent-charge";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { chargeActionLabel, RENT_MANAGE_MESSAGES } from "../../constants/rentManage";
import { askOnce } from "../../lib/askOnce";
import { chargeTitle } from "./rentDisplay";
import { rentWriteFailure } from "./rentWriteFailure";

interface RentChargeActionsProps {
  applicantId: string;
  charge: RentCharge;
  onWaive: () => void;
}

/**
 * Waive, restore or remove one charge. Only a one-off charge can be removed: a charge from the schedule
 * would come straight back on the next read, so waiving is how a period stops counting.
 */
export default function RentChargeActions({ applicantId, charge, onWaive }: RentChargeActionsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [unwaive] = useUnwaiveRentChargeMutation();
  const [remove] = useDeleteRentChargeMutation();
  const [working, setWorking] = useState<"restore" | "remove" | null>(null);
  const isWorking = useRef(false);
  const asking = useRef(false);
  const title = chargeTitle(charge);

  async function run(action: "restore" | "remove"): Promise<void> {
    if (isWorking.current) return;
    isWorking.current = true;
    setWorking(action);
    try {
      if (action === "restore") await unwaive({ chargeId: charge.id, applicantId }).unwrap();
      else await remove({ chargeId: charge.id, applicantId }).unwrap();
      showToast(action === "restore" ? RENT_MANAGE_MESSAGES.chargeRestored : RENT_MANAGE_MESSAGES.chargeRemoved);
    } catch (error) {
      showToast(rentWriteFailure(error, "other"), "error");
    } finally {
      isWorking.current = false;
      setWorking(null);
    }
  }

  if (charge.waived_at) {
    return (
      <LoadingButton
        accessibilityLabel={chargeActionLabel(RENT_MANAGE_MESSAGES.restore, title)}
        isLoading={working === "restore"}
        loadingText={RENT_MANAGE_MESSAGES.restoring}
        onPress={() => void run("restore")}
        variant="secondary"
      >
        {RENT_MANAGE_MESSAGES.restore}
      </LoadingButton>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <LoadingButton accessibilityLabel={chargeActionLabel(RENT_MANAGE_MESSAGES.waive, title)} disabled={working !== null} onPress={onWaive} variant="secondary">
        {RENT_MANAGE_MESSAGES.waive}
      </LoadingButton>
      {charge.schedule_id === null ? (
        <LoadingButton
          accessibilityLabel={chargeActionLabel(RENT_MANAGE_MESSAGES.removeCharge, title)}
          disabled={working === "restore"}
          isLoading={working === "remove"}
          loadingText={RENT_MANAGE_MESSAGES.removing}
          onPress={() =>
            askOnce(asking, RENT_MANAGE_MESSAGES.removeChargeTitle, RENT_MANAGE_MESSAGES.removeChargeBody, {
              text: RENT_MANAGE_MESSAGES.confirmRemove,
              style: "destructive",
              onPress: () => void run("remove"),
            })
          }
          variant="destructive"
        >
          {RENT_MANAGE_MESSAGES.removeCharge}
        </LoadingButton>
      ) : (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{RENT_MANAGE_MESSAGES.removeChargeOnlyOneOff}</Text>
      )}
    </View>
  );
}
