import { useGetApplicationQuery, useListApplicationEventsQuery } from "@myjobhunter/api-client/store/applicationsApi";
import { useGetCompanyQuery } from "@myjobhunter/api-client/store/companiesApi";
import { useDocumentsPages } from "@myjobhunter/api-client/hooks/useDocumentsPages";
import { currentKanbanColumn } from "@myjobhunter/api-client/utils/currentKanbanColumn";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { APPLICATION_MESSAGES } from "../../constants/applications";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../constants/applicationDetail";
import type { ApplicationDetailScreenProps } from "../../types/ApplicationDetailScreenProps";
import ApplicationActions from "./ApplicationActions";
import ApplicationDetailSkeleton from "./ApplicationDetailSkeleton";
import ApplicationHeader from "./ApplicationHeader";
import ContactsSection from "./ContactsSection";
import DocumentsSection from "./DocumentsSection";
import EventsSection from "./EventsSection";
import NotesSection from "./NotesSection";
import OverviewSection from "./OverviewSection";

/** One application: its header and actions, overview, notes, timeline, documents and contacts. */
export default function ApplicationDetailScreen({ id }: ApplicationDetailScreenProps) {
  const { spacing } = useTheme();
  // Set once a delete lands: the leave guards stand down first, then the screen goes back.
  const [isLeaving, setIsLeaving] = useState(false);
  const { currentData: application, error, isFetching, refetch } = useGetApplicationQuery(id);
  const events = useListApplicationEventsQuery(id);
  const documents = useDocumentsPages({ application_id: id });
  // After the id changes the rows held are the previous application's, until this one's first page arrives or fails.
  const hasCurrentDocuments = documents.hasData && !documents.isFiltering && documents.loadError === undefined;
  const company = useGetCompanyQuery(application?.company_id ?? "", { skip: !application?.company_id });
  const { refresh, isRefreshing, refreshControl } = useRefresh(
    () => Promise.all([refetch(), events.refetch(), documents.refetch()]),
    error,
  );

  useEffect(() => {
    if (isLeaving) router.back();
  }, [isLeaving]);

  if (!application && (isFetching || !error)) return <ApplicationDetailSkeleton />;
  if (!application) {
    const isGone = isNotFound(error);
    return (
      <EmptyState
        action={
          isGone
            ? { label: MESSAGES.back, onPress: () => router.back() }
            : { label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }
        }
        body={isGone ? MESSAGES.maybeDeleted : MESSAGES.tryAgainOffer}
        heading={isGone ? MESSAGES.cantFind : MESSAGES.couldntLoad}
      />
    );
  }

  const column = currentKanbanColumn(application.events);
  // A company that won't load shouldn't hold the screen up; the list says the same when it has no name.
  const companyName = company.currentData?.name ?? (company.isError ? APPLICATION_MESSAGES.unknownCompany : null);

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.xl, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
      testID="application-detail"
    >
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <ApplicationHeader application={application} column={column} companyName={companyName} />
      <ApplicationActions application={application} column={column} isLeaving={isLeaving} onDeleted={() => setIsLeaving(true)} />
      <OverviewSection application={application} />
      <NotesSection applicationId={id} isLeaving={isLeaving} notes={application.notes} />
      <EventsSection
        applicationId={id}
        events={events.currentData?.items}
        isError={Boolean(events.error)}
        isLoading={!events.currentData && events.isFetching}
        onRetry={async () => {
          await events.refetch();
        }}
      />
      <DocumentsSection
        applicationId={id}
        documents={hasCurrentDocuments ? documents.documents : undefined}
        hasNextPage={documents.hasNextPage}
        isError={documents.error !== undefined}
        isLoading={documents.isLoading || documents.isFiltering}
        isLoadMoreError={documents.isLoadMoreError}
        isLoadingMore={documents.isFetchingNextPage}
        onLoadMore={documents.loadMore}
        onRetry={async () => {
          await documents.refetch();
        }}
        total={documents.total}
      />
      <ContactsSection applicationId={id} contacts={application.contacts} />
    </ScrollView>
  );
}
