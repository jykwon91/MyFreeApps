import { useState } from "react";
import {
  UserCircle,
  Briefcase,
  GraduationCap,
  Code2,
  ClipboardList,
  DollarSign,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { showError, extractErrorMessage, formatSalaryRange } from "@platform/ui";
import ProfileSkeleton from "@/features/profile/ProfileSkeleton";
import ProfileHeaderDialog from "@/features/profile/ProfileHeaderDialog";
import WorkHistoryDialog from "@/features/profile/WorkHistoryDialog";
import EducationDialog from "@/features/profile/EducationDialog";
import ScreeningAnswerDialog from "@/features/profile/ScreeningAnswerDialog";
import ResumeUploadSection from "@/features/profile/ResumeUploadSection";
import SkillAddForm from "@/features/profile/SkillAddForm";
import ScreeningAnswerRow from "@/features/profile/ScreeningAnswerRow";
import { deleteWithFeedback } from "@/lib/delete-with-feedback";
import { REMOTE_PREFERENCE_LABELS } from "@myjobhunter/api-client/constants/remotePreferenceLabels";
import { REMOTE_PREFERENCES } from "@myjobhunter/api-client/constants/remotePreferences";
import { educationDegreeLine } from "@myjobhunter/api-client/utils/educationDegreeLine";
import { educationYearsLine } from "@myjobhunter/api-client/utils/educationYearsLine";
import { formatSeniority } from "@myjobhunter/api-client/utils/formatSeniority";
import { formatWorkAuthStatus } from "@myjobhunter/api-client/utils/formatWorkAuthStatus";
import { formatWorkDateRange } from "@myjobhunter/api-client/utils/formatWorkDateRange";
import { unansweredScreeningQuestions } from "@myjobhunter/api-client/utils/unansweredScreeningQuestions";
import { useGetProfileQuery, useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import { useListWorkHistoryQuery, useDeleteWorkHistoryMutation } from "@myjobhunter/api-client/store/workHistoryApi";
import { useListEducationQuery, useDeleteEducationMutation } from "@myjobhunter/api-client/store/educationApi";
import { useListSkillsQuery, useDeleteSkillMutation } from "@myjobhunter/api-client/store/skillsApi";
import {
  useListScreeningAnswersQuery,
  useDeleteScreeningAnswerMutation,
} from "@myjobhunter/api-client/store/screeningAnswersApi";
import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";
import type { Education } from "@myjobhunter/api-client/types/education/education";
import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";

export default function Profile() {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetProfileQuery();
  const { data: workHistoryData, isLoading: whLoading } = useListWorkHistoryQuery();
  const { data: educationData, isLoading: eduLoading } = useListEducationQuery();
  const { data: skillsData, isLoading: skillsLoading } = useListSkillsQuery();
  const { data: screeningData, isLoading: screeningLoading } = useListScreeningAnswersQuery();

  const [deleteWorkHistory] = useDeleteWorkHistoryMutation();
  const [deleteEducation] = useDeleteEducationMutation();
  const [deleteSkill] = useDeleteSkillMutation();
  const [deleteScreeningAnswer] = useDeleteScreeningAnswerMutation();
  const [updateProfile] = useUpdateProfileMutation();

  // Dialog state
  const [headerDialogOpen, setHeaderDialogOpen] = useState(false);
  const [whDialogOpen, setWhDialogOpen] = useState(false);
  const [whEditTarget, setWhEditTarget] = useState<WorkHistory | undefined>();
  const [eduDialogOpen, setEduDialogOpen] = useState(false);
  const [eduEditTarget, setEduEditTarget] = useState<Education | undefined>();
  const [screeningDialogOpen, setScreeningDialogOpen] = useState(false);
  const [screeningEditTarget, setScreeningEditTarget] = useState<ScreeningAnswer | undefined>();

  const isLoading = profileLoading || whLoading || eduLoading || skillsLoading || screeningLoading;

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (profileError || !profile) {
    return (
      <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
        <p className="text-destructive">Couldn't load profile. Try refreshing.</p>
      </div>
    );
  }

  const workHistory = workHistoryData?.items ?? [];
  const education = educationData?.items ?? [];
  const skills = skillsData?.items ?? [];
  const screeningAnswers = screeningData?.items ?? [];
  const existingSkillNames = skills.map((s) => s.name);
  const existingAnswerKeys = screeningAnswers.map((a) => a.question_key);
  const eeocAnswers = screeningAnswers.filter((a) => a.is_eeoc);
  const nonEeocAnswers = screeningAnswers.filter((a) => !a.is_eeoc);

  async function handleDeleteWorkHistory(id: string, company: string) {
    if (!confirm(`Delete "${company}" from work history?`)) return;
    await deleteWithFeedback(() => deleteWorkHistory(id).unwrap(), "Work history deleted", "Couldn't delete");
  }

  async function handleDeleteEducation(id: string, school: string) {
    if (!confirm(`Delete "${school}" from education?`)) return;
    await deleteWithFeedback(() => deleteEducation(id).unwrap(), "Education deleted", "Couldn't delete");
  }

  async function handleDeleteSkill(id: string, name: string) {
    await deleteWithFeedback(() => deleteSkill(id).unwrap(), `Skill "${name}" removed`, "Couldn't remove skill");
  }

  async function handleDeleteScreeningAnswer(id: string) {
    if (!confirm("Remove this screening answer?")) return;
    await deleteWithFeedback(() => deleteScreeningAnswer(id).unwrap(), "Answer removed", "Couldn't remove answer");
  }

  async function handleRemoteToggle(pref: string) {
    try {
      await updateProfile({ remote_preference: pref }).unwrap();
    } catch (err) {
      showError(`Couldn't update preference: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
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

      {/* ------------------------------------------------------------------ */}
      {/* Location preferences */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Locations</h2>
        </div>
        <div className="mb-3">
          {profile.locations.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.locations.map((loc) => (
                <span
                  key={loc}
                  className="text-xs bg-muted px-2 py-1 rounded-full"
                >
                  {loc}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No target locations set</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {REMOTE_PREFERENCES.map((pref) => (
            <button
              key={pref}
              onClick={() => void handleRemoteToggle(pref)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors min-h-[36px] ${
                profile.remote_preference === pref
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {REMOTE_PREFERENCE_LABELS[pref]}
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Work history */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={16} className="text-muted-foreground" />
            <h2 className="font-semibold">Work history</h2>
          </div>
          <button
            onClick={() => {
              setWhEditTarget(undefined);
              setWhDialogOpen(true);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
            aria-label="Add work history"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {workHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No work history added yet</p>
        ) : (
          <div className="space-y-4">
            {workHistory.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Briefcase size={14} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">{entry.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatWorkDateRange(entry.start_date, entry.end_date, entry.is_current)}
                  </p>
                  {entry.bullets.length > 0 ? (
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      {entry.bullets.map((b, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          {b}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setWhEditTarget(entry);
                      setWhDialogOpen(true);
                    }}
                    className="p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Edit ${entry.company_name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => void handleDeleteWorkHistory(entry.id, entry.company_name)}
                    className="p-2 rounded hover:bg-destructive/10 text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Delete ${entry.company_name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Education */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap size={16} className="text-muted-foreground" />
            <h2 className="font-semibold">Education</h2>
          </div>
          <button
            onClick={() => {
              setEduEditTarget(undefined);
              setEduDialogOpen(true);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
            aria-label="Add education"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {education.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No education added yet</p>
        ) : (
          <div className="space-y-4">
            {education.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap size={14} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{entry.school}</p>
                  {educationDegreeLine(entry) ? (
                    <p className="text-sm text-muted-foreground">{educationDegreeLine(entry)}</p>
                  ) : null}
                  {educationYearsLine(entry) ? (
                    <p className="text-xs text-muted-foreground">{educationYearsLine(entry)}</p>
                  ) : null}
                  {entry.gpa ? (
                    <p className="text-xs text-muted-foreground">GPA: {entry.gpa}</p>
                  ) : null}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEduEditTarget(entry);
                      setEduDialogOpen(true);
                    }}
                    className="p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Edit ${entry.school}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => void handleDeleteEducation(entry.id, entry.school)}
                    className="p-2 rounded hover:bg-destructive/10 text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Delete ${entry.school}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Skills */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Code2 size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Skills</h2>
        </div>

        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill.id}
                className="inline-flex items-center gap-1.5 text-sm bg-muted px-3 py-1.5 rounded-full"
              >
                <span>{skill.name}</span>
                {/* years_experience is number | null; 0 years is a valid distinct value — keep !== null */}
                {skill.years_experience !== null ? (
                  <span className="text-xs text-muted-foreground">{skill.years_experience}y</span>
                ) : null}
                <button
                  onClick={() => void handleDeleteSkill(skill.id, skill.name)}
                  className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors min-h-[20px] min-w-[20px] flex items-center justify-center"
                  aria-label={`Remove ${skill.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No skills added yet</p>
        )}

        <SkillAddForm existingNames={existingSkillNames} />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Screening answers */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-muted-foreground" />
            <h2 className="font-semibold">Screening answers</h2>
          </div>
          <button
            onClick={() => {
              setScreeningEditTarget(undefined);
              setScreeningDialogOpen(true);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
            aria-label="Add screening answer"
            disabled={unansweredScreeningQuestions(existingAnswerKeys).length === 0}
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {screeningAnswers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No pre-filled answers yet — add common answers to speed up job applications
          </p>
        ) : (
          <div className="space-y-6">
            {nonEeocAnswers.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Standard questions
                </p>
                <div className="space-y-2">
                  {nonEeocAnswers.map((answer) => (
                    <ScreeningAnswerRow
                      key={answer.id}
                      answer={answer}
                      onEdit={() => {
                        setScreeningEditTarget(answer);
                        setScreeningDialogOpen(true);
                      }}
                      onDelete={() => void handleDeleteScreeningAnswer(answer.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {eeocAnswers.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  EEOC questions
                </p>
                <div className="space-y-2">
                  {eeocAnswers.map((answer) => (
                    <ScreeningAnswerRow
                      key={answer.id}
                      answer={answer}
                      onEdit={() => {
                        setScreeningEditTarget(answer);
                        setScreeningDialogOpen(true);
                      }}
                      onDelete={() => void handleDeleteScreeningAnswer(answer.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Resume upload */}
      {/* ------------------------------------------------------------------ */}
      <ResumeUploadSection profileId={profile.id} />

      {/* ------------------------------------------------------------------ */}
      {/* Dialogs */}
      {/* ------------------------------------------------------------------ */}
      {profile ? (
        <ProfileHeaderDialog
          open={headerDialogOpen}
          onOpenChange={setHeaderDialogOpen}
          profile={profile}
        />
      ) : null}

      <WorkHistoryDialog
        open={whDialogOpen}
        onOpenChange={setWhDialogOpen}
        existing={whEditTarget}
      />

      <EducationDialog
        open={eduDialogOpen}
        onOpenChange={setEduDialogOpen}
        existing={eduEditTarget}
      />

      <ScreeningAnswerDialog
        open={screeningDialogOpen}
        onOpenChange={setScreeningDialogOpen}
        existing={screeningEditTarget}
        existingKeys={existingAnswerKeys}
      />
    </div>
  );
}
