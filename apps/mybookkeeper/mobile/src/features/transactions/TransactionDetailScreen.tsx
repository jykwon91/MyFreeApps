import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import { useDeleteTransactionMutation, useGetTransactionQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { Banner, EmptyState, LoadingButton, OptionSheet, Skeleton, useRefresh, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DUPLICATES_LINK } from "../../constants/duplicates";
import { useCanWrite } from "../workspace/useCanWrite";
import { selectableProperties } from "./transactionEditValues";
import { categoryLabel, displayAmount, isMoneyIn, isReviewable, spokenDate, propertyLabel, spokenAmount, spokenKind, statusLabel, transactionName } from "./transactionDisplay";
import TransactionFact from "./TransactionFact";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useApproveTransaction } from "./useApproveTransaction";

export default function TransactionDetailScreen({ id, reviewQueue }: { id: string; reviewQueue: TransactionListParams | null }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const canWrite = useCanWrite();
  const { showToast } = useToast();
  const { currentData, error, isFetching, refetch } = useGetTransactionQuery(id);
  const { data: properties = [], isError: propertiesFailed, isLoading: propertiesLoading } = useGetPropertiesQuery();
  const { approve, goToNext, isAdvancing, isApproving, queueRow, waitingCount } = useApproveTransaction(id, reviewQueue);
  const [deleteTransaction, { isLoading: isDeleting }] = useDeleteTransactionMutation();
  const [isPropertySheetOpen, setIsPropertySheetOpen] = useState(false);
  const { refreshControl } = useRefresh(refetch, error);

  // currentData, never data: moving to the next one must not show the last one's numbers.
  const transaction = currentData ?? queueRow;

  if (!transaction && (isFetching || !error)) {
    return (
      <View accessibilityLabel="Loading this transaction" style={{ gap: spacing.md, padding: spacing.lg }} testID="transaction-skeleton">
        <Skeleton height={28} width="60%" />
        <Skeleton height={40} width="40%" />
        <Skeleton height={200} />
      </View>
    );
  }
  if (!transaction) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: async () => { await refetch(); } }}
        body={isGone ? "It may have been deleted." : "Want me to try again?"}
        heading={isGone ? "I can't find that transaction." : "I couldn't load that transaction."}
      />
    );
  }

  const name = transactionName(transaction);
  const isDuplicate = transaction.status === "duplicate";
  const reviewable = isReviewable(transaction.status);
  const propertyOptions = selectableProperties(properties, null).map((property) => ({ value: property.id, label: property.name }));

  function confirmDelete(): void {
    const keepsDocument = transaction?.source_document_id ? " The document it came from stays in Documents." : "";
    Alert.alert(`Delete ${name}?`, `I can't bring this back. It will drop out of your totals.${keepsDocument}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTransaction(id).unwrap();
            showToast("Deleted.");
            router.back();
          } catch (deleteError) {
            if (httpStatus(deleteError) === 404) {
              showToast("That one's already gone.");
              router.back();
            } else {
              showToast("I couldn't delete that. Want to try again?", "error");
            }
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}
      >
        {waitingCount ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{waitingCount} to review</Text> : null}
        <View
          accessibilityLabel={`${name}, ${spokenKind(transaction)}, ${spokenAmount(transaction)}`}
          accessible
          style={{ gap: spacing.xs }}
        >
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {name}
          </Text>
          <Text
            style={{
              fontSize: fontSize.xl,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
              color: isMoneyIn(transaction) ? colors.positiveText : colors.foreground,
            }}
          >
            {displayAmount(transaction)}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {transaction.transaction_type === "income" ? "Income" : "Expense"}
          </Text>
        </View>

        {isDuplicate ? (
          <Banner
            actions={[{ label: "Review duplicates", onPress: () => router.push(DUPLICATES_LINK) }]}
            message="I think this is a duplicate of another transaction. Compare them to merge or keep one."
          />
        ) : (
          <TransactionFact
            label="Status"
            value={transaction.status === "approved" ? "\u2713 Approved" : statusLabel(transaction.status)}
          />
        )}
        {reviewable && transaction.review_reason ? <TransactionFact label="Why I flagged this" value={transaction.review_reason} /> : null}

        <TransactionFact label="Date" value={spokenDate(transaction.transaction_date)} />
        <TransactionFact label="Category" value={categoryLabel(transaction.category)} />
        <TransactionFact label="Property" value={propertyLabel(transaction.property_id, properties)} />
        {transaction.description ? <TransactionFact label="Description" value={transaction.description} /> : null}
        {transaction.source_document_id ? (
          <LoadingButton
            accessibilityLabel={`From ${transaction.source_file_name ?? "a document"}, open the document`}
            onPress={() => router.push(`/documents/${transaction.source_document_id}`)}
            variant="ghost"
          >
            {`From: ${transaction.source_file_name ?? "a document"}`}
          </LoadingButton>
        ) : null}

        {canWrite && !isDuplicate ? (
          <LoadingButton isLoading={isDeleting} loadingText="Deleting…" onPress={confirmDelete} variant="destructive">
            Delete
          </LoadingButton>
        ) : null}
      </ScrollView>

      {canWrite && !isDuplicate ? (
        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <LoadingButton onPress={() => router.push(`/transactions/${id}/edit`)} style={{ flex: 1 }} variant="secondary">
            Edit
          </LoadingButton>
          {reviewable ? (
            <LoadingButton
              isLoading={isApproving}
              loadingText="Approving…"
              onPress={() => (transaction.property_id ? approve() : setIsPropertySheetOpen(true))}
              style={{ flex: 2 }}
            >
              Approve
            </LoadingButton>
          ) : reviewQueue ? (
            <LoadingButton isLoading={isAdvancing} loadingText="Finding the next one…" onPress={goToNext} style={{ flex: 2 }}>
              Next to review
            </LoadingButton>
          ) : null}
        </View>
      ) : null}

      <OptionSheet
        description="I need a property before I can approve this."
        emptyText={
          propertiesFailed
            ? "I couldn't load your properties. Close this and try again."
            : propertiesLoading
              ? "I'm still loading your properties."
              : "You don't have any properties yet. You can add one on the website."
        }
        isOpen={isPropertySheetOpen}
        onClose={() => setIsPropertySheetOpen(false)}
        onSelect={(propertyId) => {
          setIsPropertySheetOpen(false);
          void approve(propertyId);
        }}
        options={propertyOptions}
        title="Which property is this for?"
        value={null}
      />
    </View>
  );
}
