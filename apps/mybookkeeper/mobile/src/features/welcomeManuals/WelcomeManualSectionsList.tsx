import { WELCOME_MANUAL_MAX_SECTIONS } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { EmptyState, LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { WELCOME_MANUAL_SECTION_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import type { WelcomeManualView } from "../../types/WelcomeManualView";
import { useCanWrite } from "../workspace/useCanWrite";
import { roomNameFor } from "./welcomeManualRoomOptions";
import WelcomeManualSectionRow from "./WelcomeManualSectionRow";
import WelcomeManualSectionsReorder from "./WelcomeManualSectionsReorder";

export default function WelcomeManualSectionsList({ manual, refreshControl }: WelcomeManualView) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [isReordering, setIsReordering] = useState(false);
  const base = `/welcome-manuals/${manual.id}/sections`;
  const canAdd = manual.sections.length < WELCOME_MANUAL_MAX_SECTIONS;
  const add = () => router.push(`${base}/new`);

  return (
    <>
      <FlatList
        ListEmptyComponent={<EmptyState action={canWrite && canAdd ? { label: MESSAGES.add, onPress: add } : undefined} body={MESSAGES.noneBody} heading={MESSAGES.none} />}
        ListHeaderComponent={
          canWrite && manual.sections.length > 0 ? (
            <View style={{ gap: spacing.sm, padding: spacing.lg }}>
              {canAdd ? (
                <LoadingButton onPress={add}>{MESSAGES.add}</LoadingButton>
              ) : (
                <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.atLimit}</Text>
              )}
              {manual.sections.length > 1 ? (
                <LoadingButton onPress={() => setIsReordering(true)} variant="secondary">
                  {MESSAGES.reorder}
                </LoadingButton>
              ) : null}
            </View>
          ) : undefined
        }
        contentInsetAdjustmentBehavior="automatic"
        data={manual.sections}
        keyExtractor={(section) => section.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <WelcomeManualSectionRow onPress={() => router.push(`${base}/${item.id}`)} roomName={roomNameFor(manual.rooms, item.room_id)} section={item} />
        )}
        testID="welcome-manual-sections-list"
      />
      {isReordering ? <WelcomeManualSectionsReorder manual={manual} onClose={() => setIsReordering(false)} /> : null}
    </>
  );
}
