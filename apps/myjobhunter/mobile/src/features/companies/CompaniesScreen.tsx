import { useListCompaniesQuery } from "@myjobhunter/api-client/store/companiesApi";
import { sortCompanies } from "@myjobhunter/api-client/utils/sortCompanies";
import { EmptyState, OptionSheet, useOpenWebsite, useRefresh } from "@platform/mobile";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { COMPANY_MESSAGES as MESSAGES } from "../../constants/companies";
import { COMPANY_SORT_OPTIONS, COMPANY_SORTS, DEFAULT_COMPANY_SORT } from "../../constants/companySorts";
import type { CompanySortKey } from "../../types/CompanySortKey";
import AddCompanySheet from "./AddCompanySheet";
import CompaniesListHeader from "./CompaniesListHeader";
import CompaniesSkeleton from "./CompaniesSkeleton";
import CompanyRow from "./CompanyRow";

/** The website's Companies page: every company, sortable by any column, and Add company. */
export default function CompaniesScreen() {
  const openWebsite = useOpenWebsite();
  const [sortKey, setSortKey] = useState<CompanySortKey>(DEFAULT_COMPANY_SORT);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  // The server sends every company at once, so the list sorts here, as the website's table does.
  const { data, error, isLoading, refetch } = useListCompaniesQuery();
  const { isRefreshing, refresh, refreshControl } = useRefresh(refetch, error);
  const sort = COMPANY_SORTS[sortKey];
  const rows = useMemo(() => sortCompanies(data?.items ?? [], sort), [data, sort]);

  const addCompany = () => setIsAddSheetOpen(true);

  // Once anything has loaded, a failed refresh keeps it on screen (even an empty list) under a banner.
  const emptyList = isLoading ? (
    <CompaniesSkeleton />
  ) : error && !data ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : (
    <EmptyState action={{ label: MESSAGES.addFromEmpty, onPress: addCompany }} body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListHeaderComponent={
          data && (error || rows.length > 0) ? (
            <CompaniesListHeader
              hasRows={rows.length > 0}
              isStale={Boolean(error)}
              onAdd={addCompany}
              onSort={() => setIsSortSheetOpen(true)}
              sortLabel={sort.label}
            />
          ) : undefined
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(company) => company.id}
        refreshControl={refreshControl}
        // The company's own screen comes in its own change; until then it opens on the website.
        renderItem={({ item }) => <CompanyRow company={item} onPress={() => void openWebsite(WEB_BASE_URL, `/companies/${item.id}`)} />}
        testID="companies-list"
      />
      <OptionSheet
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        onSelect={(next) => {
          setIsSortSheetOpen(false);
          setSortKey(next);
        }}
        options={COMPANY_SORT_OPTIONS}
        title={MESSAGES.sortTitle}
        value={sortKey}
      />
      {isAddSheetOpen ? <AddCompanySheet onClose={() => setIsAddSheetOpen(false)} /> : null}
    </View>
  );
}
