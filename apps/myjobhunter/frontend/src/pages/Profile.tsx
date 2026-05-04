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
import { LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import ProfileSkeleton from "@/features/profile/ProfileSkeleton";
import ProfileHeaderDialog from "@/features/profile/ProfileHeaderDialog";
import WorkHistoryDialog from "@/features/profile/WorkHistoryDialog";
import EducationDialog from "@/features/profile/EducationDialog";
import ScreeningAnswerDialog from "@/features/profile/ScreeningAnswerDialog";
import ResumeUploadSection from "@/features/profile/ResumeUploadSection";
import { useGetProfileQuery, useUpdateProfileMutation } from "@/lib/profileApi";
import { useListWorkHistoryQuery, useDeleteWorkHistoryMutation } from "@/lib/workHistoryApi";
import { useListEducationQuery, useDeleteEducationMutation } from "@/lib/educationApi";
import {
  useListSkillsQuery,
  useCreateSkillMutation,
  useDeleteSkillMutation,
} from "@/lib/skillsApi";
import {
  useListScreeningAnswersQuery,
  useDeleteScreeningAnswerMutation,
} from "@/lib/screeningAnswersApi";
import type { WorkHistory } from "@/types/work-history/work-history";
import type { Education } from "@/types/education/education";
import type { ScreeningAnswer } from "@/types/screening-answer/screening-answer";

// ---------------------------------------------------------------------------
// Salary section — inline edit with update mutation
// ---------------------------------------------------------------------------

const SALARY_PERIOD_LABELS: Record<string, string> = {
  annual: "/ year",
  hourly: "/ hour",
  monthly: "/ month",
};

const REMOTE_PREF_LABELS: Record<string, string> = {
  remote_only: "Remote only",
  hybrid: "Hybrid",
  onsite: "On-site",
  any: "Open to all",
};

function formatSalaryRange(
  min: string | null,
  max: string | null,
  currency: string,
  period: string,
): string {
  if (!min && !max) return "Not set";
  const fmt = (n: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      parseFloat(n),
    );
  const label = SALARY_PERIOD_LABELS[period] ?? "";
  if (min && max) return `${fmt(min)} – ${fmt(max)} ${label}`;
  if (min) return `${fmt(min)}+ ${label}`;
  return `up to ${fmt(max!)} ${label}`;
}

function formatDateRange(start: string, end: string | null): string {
  const fmt = (d: string) => {
    const [year, month] = d.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  };
  return end ? `${fmt(start)} – ${fmt(end)}` : `${fmt(start)} – Present`;
}

// ---------------------------------------------------------------------------
// Skills inline add form
// ---------------------------------------------------------------------------

const SKILL_YEAR_OPTIONS = [
  { value: "", label: "— yrs —" },
  { value: "1", label: "< 1 yr" },
  { value: "2", label: "2 yrs" },
  { value: "3", label: "3 yrs" },
  { value: "5", label: "5 yrs" },
  { value: "7", label: "7 yrs" },
  { value: "10", label: "10+ yrs" },
];

interface SkillAddFormProps {
  existingNames: string[];
}

function SkillAddForm({ existingNames }: SkillAddFormProps) {
  const [name, setName] = useState("");
  const [years, setYears] = useState("");
  const [createSkill, { isLoading }] = useCreateSkillMutation();

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existingNames.map((n) => n.toLowerCase()).includes(trimmed.toLowerCase())) {
      showError(`Skill "${trimmed}" already exists`);
      return;
    }
    try {
      await createSkill({
        name: trimmed,
        years_experience: years ? parseInt(years, 10) : null,
        category: null,
      }).unwrap();
      showSuccess(`Skill "${trimmed}" added`);
      setName("");
      setYears("");
    } catch (err) {
      showError(`Couldn't add skill: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleAdd();
          }
        }}
        className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
        placeholder="Add a skill..."
        aria-label="Skill name"
      />
      <select
        value={years}
        onChange={(e) => setYears(e.target.value)}
        className="border rounded-md px-2 py-2 text-sm bg-background"
        aria-label="Years of experience"
      >
        {SKILL_YEAR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <LoadingButton
        type="button"
        isLoading={isLoading}
        loadingText="Adding..."
        onClick={() => void handleAdd()}
        className="min-h-[44px]"
      >
        <Plus size={16} />
      </LoadingButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Profile page
// ---------------------------------------------------------------------------

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
      <div className="p-6">
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
    try {
      await deleteWorkHistory(id).unwrap();
      showSuccess("Work history deleted");
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
    }
  }

  async function handleDeleteEducation(id: string, school: string) {
    if (!confirm(`Delete "${school}" from education?`)) return;
    try {
      await deleteEducation(id).unwrap();
      showSuccess("Education deleted");
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
    }
  }

  async function handleDeleteSkill(id: string, name: string) {
    try {
      await deleteSkill(id).unwrap();
      showSuccess(`Skill "${name}" removed`);
    } catch (err) {
      showError(`Couldn't remove skill: ${extractErrorMessage(err)}`);
    }
  }

  async function handleDeleteScreeningAnswer(id: string) {
    if (!confirm("Remove this screening answer?")) return;
    try {
      await deleteScreeningAnswer(id).unwrap();
      showSuccess("Answer removed");
    } catch (err) {
      showError(`Couldn't remove answer: ${extractErrorMessage(err)}`);
    }
  }

  async function handleRemoteToggle(pref: string) {
    try {
      await updateProfile({ remote_preference: pref }).unwrap();
    } catch (err) {
      showError(`Couldn't update preference: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
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
                {profile.seniority
                  ? `${profile.seniority.charAt(0).toUpperCase()}${profile.seniority.slice(1)} level`
                  : "Level not set"}
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
            <dd className="capitalize">{profile.work_auth_status.replace(/_/g, " ")}</dd>
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
          {(["remote_only", "hybrid", "onsite", "any"] as const).map((pref) => (
            <button
              key={pref}
              onClick={() => void handleRemoteToggle(pref)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors min-h-[36px] ${
                profile.remote_preference === pref
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {REMOTE_PREF_LABELS[pref]}
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
                    {formatDateRange(entry.start_date, entry.end_date)}
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
                  {entry.degree || entry.field ? (
                    <p className="text-sm text-muted-foreground">
                      {[entry.degree, entry.field].filter(Boolean).join(" in ")}
                    </p>
                  ) : null}
                  {entry.start_year || entry.end_year ? (
                    <p className="text-xs text-muted-foreground">
                      {[entry.start_year, entry.end_year].filter(Boolean).join(" – ")}
                    </p>
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
            disabled={existingAnswerKeys.length >= 22}
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

// ---------------------------------------------------------------------------
// Screening answer row — extracted to avoid inline component definition
// ---------------------------------------------------------------------------

interface ScreeningAnswerRowProps {
  answer: ScreeningAnswer;
  onEdit: () => void;
  onDelete: () => void;
}

function ScreeningAnswerRow({ answer, onEdit, onDelete }: ScreeningAnswerRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 group rounded-md p-2 hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground capitalize">
          {answer.question_key.replace(/_/g, " ")}
        </p>
        <p className="text-sm truncate">{answer.answer ?? <em className="text-muted-foreground">No answer</em>}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Edit answer"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded hover:bg-destructive/10 text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Delete answer"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
