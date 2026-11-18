import { useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { LEASE_DOCUMENTS_LOCKED_NOTE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState, LoadingButton, StaleDataBanner, useRefresh, useTheme, goBackOr } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { continueWithDocuments, LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import { LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";
import LeaseTemplatesSkeleton, { LeaseTemplateSkeletonRow } from "../leaseTemplates/LeaseTemplatesSkeleton";
import { useLeaseTemplatePages } from "../leaseTemplates/useLeaseTemplatePages";
import PagedListFooter from "../shell/PagedListFooter";
import TemplatePickerRow from "../newLease/TemplatePickerRow";
import { addDocumentDetailsPath } from "./addDocumentFlow";

/** Which of the host's templates to make documents from, for a lease that already exists. */
export default function AddDocumentPickList({ leaseId }: { leaseId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const lease = useGetSignedLeaseByIdQuery(leaseId);
  const templates = useLeaseTemplatePages();
  const error = lease.error ?? templates.error;
  const { refresh, refreshControl } = useRefresh(() => Promise.all([lease.refetch(), templates.reload()]), error);
  const { rows } = templates;
  const onLease = new Set(lease.currentData?.templates.map((template) => template.id));
  const isLocked = lease.currentData?.documents_locked ?? false;
  // A pick that the lease has since locked out is dropped, so it is never sent.
  const picked = pickedIds.filter((id) => !(isLocked && onLease.has(id)));

  if (httpStatus(lease.error) === 404) {
    return <EmptyState action={{ label: MESSAGES.goBack, onPress: () => goBackOr("/leases") }} body={MESSAGES.goneBody} heading={MESSAGES.goneHeading} />;
  }

  function toggle(id: string): void {
    setPickedIds(picked.includes(id) ? picked.filter((other) => other !== id) : [...picked, id]);
  }

  const isLoaded = templates.isLoaded && Boolean(lease.currentData);
  const emptyList = !isLoaded && !error ? (
    <LeaseTemplatesSkeleton />
  ) : !isLoaded ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadTemplates} />
  ) : (
    <EmptyState
      action={{ label: MESSAGES.addTemplate, onPress: () => router.push("/lease-templates/new") }}
      body={MESSAGES.noTemplatesBody}
      heading={MESSAGES.noTemplatesHeading}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={templates.isFetchingNextPage}
            loadMoreFailed={templates.loadMoreFailed}
            loadingLabel={LEASE_TEMPLATE_MESSAGES.loadingMore}
            onRetry={() => void templates.loadMore()}
            skeletonRow={<LeaseTemplateSkeletonRow />}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(error && isLoaded && !templates.loadMoreFailed)} />
            <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
              {MESSAGES.pickTitle}
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.pickBody}</Text>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={isLoaded ? rows : []}
        keyExtractor={(template) => template.id}
        onEndReached={templates.loadMoreIfAny}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => {
          const index = picked.indexOf(item.id);
          const isBlocked = isLocked && onLease.has(item.id);
          const note = isBlocked ? LEASE_DOCUMENTS_LOCKED_NOTE : onLease.has(item.id) ? MESSAGES.onThisLease : undefined;
          return <TemplatePickerRow isDisabled={isBlocked} note={note} onPress={() => toggle(item.id)} position={index === -1 ? null : index + 1} template={item} />;
        }}
        style={{ flex: 1 }}
        testID="add-document-template-list"
      />
      {picked.length > 0 ? (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <LoadingButton onPress={() => router.push(addDocumentDetailsPath(leaseId, picked))}>{continueWithDocuments(picked.length)}</LoadingButton>
        </View>
      ) : null}
    </View>
  );
}
