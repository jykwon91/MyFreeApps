import { UserCircle } from "lucide-react";
import { EmptyState, FileUploadDropzone } from "@platform/ui";
import ProfileSkeleton from "@/features/profile/ProfileSkeleton";
import { EMPTY_STATES } from "@/constants/empty-states";

// Phase 1: no data yet — simulate instant load then show empty state
const IS_LOADING = false;

export default function Profile() {
  const copy = EMPTY_STATES.profile;

  if (IS_LOADING) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <EmptyState
        icon={<UserCircle className="w-12 h-12" />}
        heading={copy.heading}
        body={copy.body}
      />
      {/* FileUploadDropzone shown in inert/disabled state — Phase 2 will wire this up */}
      <FileUploadDropzone
        onFilesSelected={() => {
          // Phase 2 will handle resume uploads
          console.info("ResumeUpload — Phase 2");
        }}
        accept=".pdf,.doc,.docx"
        disabled={true}
        label="Drop your resume here or click to browse"
        helperText="PDF, DOC, or DOCX — up to 10MB. Full upload support coming in Phase 2."
      />
    </div>
  );
}
