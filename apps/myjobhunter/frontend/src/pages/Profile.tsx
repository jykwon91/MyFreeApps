import { useState } from "react";
import { UserCircle, Pencil, DollarSign } from "lucide-react";
import { formatSalaryRange } from "@platform/ui";
import ProfileSkeleton from "@/features/profile/ProfileSkeleton";
import ProfileHeaderDialog from "@/features/profile/ProfileHeaderDialog";
import ResumeUploadSection from "@/features/profile/ResumeUploadSection";
import LocationsSection from "@/features/profile/LocationsSection";
import WorkHistorySection from "@/features/profile/WorkHistorySection";
import EducationSection from "@/features/profile/EducationSection";
import SkillsSection from "@/features/profile/SkillsSection";
import ScreeningAnswersSection from "@/features/profile/ScreeningAnswersSection";
import { formatSeniority } from "@myjobhunter/api-client/utils/formatSeniority";
import { formatWorkAuthStatus } from "@myjobhunter/api-client/utils/formatWorkAuthStatus";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import { useListWorkHistoryQuery } from "@myjobhunter/api-client/store/workHistoryApi";
import { useListEducationQuery } from "@myjobhunter/api-client/store/educationApi";
import { useListSkillsQuery } from "@myjobhunter/api-client/store/skillsApi";
import { useListScreeningAnswersQuery } from "@myjobhunter/api-client/store/screeningAnswersApi";

export default function Profile() {
  const { data: profile, isLoading: profileLoading } = useGetProfileQuery();
  const { data: workHistoryData, isLoading: whLoading } = useListWorkHistoryQuery();
  const { data: educationData, isLoading: eduLoading } = useListEducationQuery();
  const { data: skillsData, isLoading: skillsLoading } = useListSkillsQuery();
  const { data: screeningData, isLoading: screeningLoading } = useListScreeningAnswersQuery();

  const [headerDialogOpen, setHeaderDialogOpen] = useState(false);

  const isLoading = profileLoading || whLoading || eduLoading || skillsLoading || screeningLoading;

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
        <h1 className="sr-only">Profile</h1>
        <p className="text-destructive">Couldn't load profile. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <h1 className="sr-only">Profile</h1>
      {/* ------------------------------------------------------------------ */}
      {/* Header section */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <UserCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="text-sm font-medium text-muted-foreground">
                {formatSeniority(profile.seniority) ?? "Level not set"}
              </p>
              {profile.summary ? (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{profile.summary}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground italic">No summary yet</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setHeaderDialogOpen(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
            aria-label="Edit profile header"
          >
            <Pencil size={14} />
            Edit
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Salary preferences */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Salary preferences</h2>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">
              Target range
            </dt>
            <dd>
              {formatSalaryRange(
                profile.desired_salary_min,
                profile.desired_salary_max,
                profile.salary_currency,
                profile.salary_period,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">
              Work authorization
            </dt>
            <dd>{formatWorkAuthStatus(profile.work_auth_status)}</dd>
          </div>
        </dl>
      </section>

      <LocationsSection profile={profile} />

      <WorkHistorySection entries={workHistoryData?.items ?? []} />

      <EducationSection entries={educationData?.items ?? []} />

      <SkillsSection skills={skillsData?.items ?? []} />

      <ScreeningAnswersSection answers={screeningData?.items ?? []} />

      <ResumeUploadSection profileId={profile.id} />

      <ProfileHeaderDialog
        open={headerDialogOpen}
        onOpenChange={setHeaderDialogOpen}
        profile={profile}
      />
    </div>
  );
}
