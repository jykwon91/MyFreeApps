import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { LoadingButton, useTheme, WebLink } from "@platform/mobile";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { API_BASE_URL, WEB_BASE_URL } from "../../constants/api";
import { openDocumentFile } from "./openDocumentFile";
import { useFileRequestHeaders } from "./useFileRequestHeaders";

interface DocumentFileViewProps {
  document: Document;
  /** Gets a current token first, since this screen may have been open for a while. */
  refreshDocument: () => Promise<unknown>;
  onError: (message: string) => void;
}

export default function DocumentFileView({ document, refreshDocument, onError }: DocumentFileViewProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const headers = useFileRequestHeaders();
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const url = `${API_BASE_URL}/documents/${document.id}/download`;
  const mimeType = document.file_mime_type ?? "";

  async function openPdf(): Promise<void> {
    try {
      await refreshDocument();
      await openDocumentFile(url, document.id, headers());
    } catch {
      onError("I couldn't open that file. Want to try again?");
    }
  }

  /** The image's request skips the API client, so its sign-in may have expired: renew and retry once. */
  async function retryImage(): Promise<void> {
    if (imageAttempt > 0) {
      setImageFailed(true);
      return;
    }
    try {
      await refreshDocument();
      setImageAttempt(1);
    } catch {
      setImageFailed(true);
    }
  }

  if (mimeType.startsWith("image/") && !imageFailed) {
    return (
      <Image
        accessibilityLabel={`Photo of ${document.file_name ?? "this document"}`}
        key={imageAttempt}
        onError={() => void retryImage()}
        resizeMode="contain"
        source={{ uri: url, headers: headers() }}
        style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.muted }}
      />
    );
  }
  if (mimeType === "application/pdf") {
    return (
      <LoadingButton loadingText="Opening…" onPress={openPdf} variant="secondary">
        Open PDF
      </LoadingButton>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>
        {document.source === "email" && !mimeType
          ? "The original email isn't saved, but what I pulled from it is in your transactions."
          : "I can't show this file on the phone."}
      </Text>
      <WebLink label="Open on the website" webBaseUrl={WEB_BASE_URL} webPath="/documents" />
    </View>
  );
}
