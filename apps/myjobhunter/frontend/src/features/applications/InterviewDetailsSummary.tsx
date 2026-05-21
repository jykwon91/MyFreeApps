/**
 * Inline read-only summary of `interview_details` on an ApplicationEvent.
 *
 * Renders nothing when the field is null; otherwise a compact dt/dd grid
 * (type / scheduled at / duration / location / interviewers) under the
 * event card in `EventsSection`.
 */
import type { ReactNode } from "react";
import type { InterviewDetails, InterviewType } from "@/types/interview-details";

const TYPE_LABEL: Record<InterviewType, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "On-site",
  panel: "Panel",
};

function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleString();
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-medium text-foreground/80">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function ScheduledRow({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null;
  return <Row label="Scheduled">{formatScheduledAt(iso)}</Row>;
}

function DurationRow({ minutes }: { minutes: number | null | undefined }) {
  if (typeof minutes !== "number" || minutes <= 0) return null;
  return <Row label="Duration">{minutes} min</Row>;
}

function LocationLink({ value }: { value: string }) {
  if (!isUrl(value)) return <>{value}</>;
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-foreground"
    >
      {value}
    </a>
  );
}

function LocationRow({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return (
    <Row label="Where">
      <span className="break-all">
        <LocationLink value={value} />
      </span>
    </Row>
  );
}

function InterviewersRow({ names }: { names: string[] | null | undefined }) {
  if (!Array.isArray(names) || names.length === 0) return null;
  return <Row label="With">{names.join(", ")}</Row>;
}

interface Props {
  details: InterviewDetails;
}

export default function InterviewDetailsSummary({ details }: Props) {
  return (
    <dl className="text-xs grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 mt-2 text-muted-foreground">
      <Row label="Type">{TYPE_LABEL[details.type]}</Row>
      <ScheduledRow iso={details.scheduled_at} />
      <DurationRow minutes={details.duration_minutes} />
      <LocationRow value={details.location_or_link} />
      <InterviewersRow names={details.interviewer_names} />
    </dl>
  );
}
