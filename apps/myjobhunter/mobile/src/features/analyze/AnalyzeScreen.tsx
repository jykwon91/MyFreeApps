import { Banner, useDiscardPrompt, useTheme } from "@platform/mobile";
import { ScrollView } from "react-native";
import AnalysisResult from "./AnalysisResult";
import AnalyzeInputStep from "./AnalyzeInputStep";
import AnalyzeProgress from "./AnalyzeProgress";
import { useAnalyzeFlow } from "./useAnalyzeFlow";

/** The website's /analyze page: paste a link or a description, see how it ranks, then add it to applications. */
export default function AnalyzeScreen() {
  const { spacing } = useTheme();
  const flow = useAnalyzeFlow();
  useDiscardPrompt(flow.hasUnsavedInput, false);

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      testID="analyze"
    >
      {flow.analyzing ? (
        <AnalyzeProgress isLongRunning={flow.isLongRunning} onCancel={flow.cancel} source={flow.analyzing} />
      ) : flow.result ? (
        <AnalysisResult
          analysis={flow.result}
          isApplying={flow.isApplying}
          onAnalyzeAnother={flow.analyzeAnother}
          onApply={flow.addToApplications}
          onViewApplications={flow.viewApplications}
        />
      ) : (
        <>
          {flow.failure ? <Banner message={flow.failure} /> : null}
          {flow.blockedNotice && flow.source === "text" ? <Banner message={flow.blockedNotice} /> : null}
          <AnalyzeInputStep
            onAnalyzeLink={() => flow.analyzeLink()}
            onAnalyzeText={flow.analyzeText}
            onPasteLink={flow.pasteLink}
            onSourceChange={flow.setSource}
            onTextChange={flow.setTextValue}
            onUrlChange={flow.setUrlValue}
            source={flow.source}
            textError={flow.textError}
            textValue={flow.textValue}
            urlValue={flow.urlValue}
          />
        </>
      )}
    </ScrollView>
  );
}
