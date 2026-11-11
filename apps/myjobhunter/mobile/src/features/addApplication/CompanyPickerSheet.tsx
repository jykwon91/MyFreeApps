import { useListCompaniesQuery } from "@myjobhunter/api-client/store/companiesApi";
import { COMPANY_NAME_MAX_LENGTH } from "@myjobhunter/api-client/constants/companyFieldLimits";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { companyNameProblem } from "@myjobhunter/api-client/utils/companyNameProblem";
import { filterCompanies } from "@myjobhunter/api-client/utils/filterCompanies";
import { findCompanyByName } from "@myjobhunter/api-client/utils/findCompanyByName";
import { Banner, CharacterCounter, LoadingButton, MIN_TOUCH_TARGET, SearchField, useTheme } from "@platform/mobile";
import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../constants/addApplication";
import type { CompanyPickerSheetProps } from "../../types/CompanyPickerSheetProps";
import FieldError from "../applicationDetail/FieldError";
import CompanyPickerRow from "./CompanyPickerRow";
import CompanyPickerSkeleton from "./CompanyPickerSkeleton";

/**
 * The website's company combobox as a sheet: search your companies by name or website, or add
 * the name typed. A failed add is said here, and the sheet stays open to try again. Give it a new
 * `key` each time it opens, so it starts on `initialQuery` without the last opening's failure.
 */
export default function CompanyPickerSheet({ isOpen, initialQuery, onSelect, onAdd, onClose }: CompanyPickerSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData, isFetching, error, refetch } = useListCompaniesQuery();
  const [query, setQuery] = useState(initialQuery);
  const [isAdding, setIsAdding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const companies = currentData?.items;
  const matches = companies ? filterCompanies(companies, query) : [];
  const typedName = query.trim();
  // The search keeps whatever was typed or pasted; a name over the company limit can be searched but not added.
  const nameProblem = companyNameProblem(query);
  const nameTooLong = nameProblem !== undefined;
  const counter = characterCounter(typedName, COMPANY_NAME_MAX_LENGTH);
  const canAdd = companies !== undefined && typedName !== "" && !nameTooLong && !findCompanyByName(companies, typedName);

  async function add(): Promise<void> {
    setFailure(null);
    setIsAdding(true);
    try {
      await onAdd(typedName);
    } catch {
      setFailure(MESSAGES.couldntAddCompany);
    } finally {
      setIsAdding(false);
    }
  }

  function close(): void {
    if (!isAdding) onClose();
  }

  function renderEmpty() {
    if (!companies && (isFetching || !error)) return <CompanyPickerSkeleton />;
    if (!companies) {
      return (
        <Banner
          actions={[{ label: MESSAGES.tryAgain, onPress: () => void refetch() }]}
          message={MESSAGES.couldntLoadCompanies}
          style={{ margin: spacing.lg }}
        />
      );
    }
    return (
      <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>
        {companies.length === 0 ? MESSAGES.noCompanies : MESSAGES.noMatches}
      </Text>
    );
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }} testID="company-picker">
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.pickerTitle}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isAdding }}
            disabled={isAdding}
            onPress={close}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{MESSAGES.close}</Text>
          </Pressable>
        </View>
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          {failure ? <Banner message={failure} /> : null}
          <SearchField
            accessibilityLabel={MESSAGES.searchLabel}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder={MESSAGES.searchPlaceholder}
            value={query}
          />
          <FieldError message={nameTooLong ? nameProblem : undefined} />
          {counter ? <CharacterCounter counter={counter} isOver={nameTooLong} /> : null}
          {canAdd ? (
            <LoadingButton isLoading={isAdding} loadingText={MESSAGES.addingCompany} onPress={add} variant="secondary">
              {`${MESSAGES.addCompany} “${typedName}”`}
            </LoadingButton>
          ) : null}
        </View>
        <FlatList
          ListEmptyComponent={renderEmpty()}
          data={matches}
          keyExtractor={(company) => company.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <CompanyPickerRow detail={item.primary_domain} disabled={isAdding} label={item.name} onPress={() => onSelect(item)} />
          )}
        />
      </View>
    </Modal>
  );
}
