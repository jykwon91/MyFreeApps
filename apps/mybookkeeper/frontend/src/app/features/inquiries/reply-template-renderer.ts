/**
 * Frontend mirror of ``backend/app/services/inquiries/reply_template_renderer.py``.
 *
 * The composer fetches the rendered text from the backend on template
 * selection (so back-end and front-end always agree). This local helper
 * exists for unit testing parity — it is NOT used to substitute against
 * live data in the UI, only to verify in tests that the substitution rules
 * match the backend's. The backend is the source of truth.
 *
 * Variable allowlist (mirrors ``REPLY_TEMPLATE_VARIABLES`` in
 * ``backend/app/core/inquiry_enums.py``):
 *   $name, $listing, $dates, $start_date, $end_date,
 *   $employer, $host_name, $host_phone
 *
 * Substitution rule: longest variable first, so ``$host_name`` substitutes
 * before ``$name`` would match part of it.
 */

const MAX_NAME = 100;
const MAX_LISTING = 200;
const MAX_EMPLOYER = 200;
const MAX_HOST_NAME = 100;
const MAX_HOST_PHONE = 50;

const FALLBACK_NAME = "there";
const FALLBACK_LISTING = "the room";
const FALLBACK_DATES_BOTH = "your requested dates";
const FALLBACK_START_DATE = "the start date you requested";
const FALLBACK_END_DATE = "the end date you requested";

function sanitize(value: string | null | undefined, maxLength: number): string {
  if (!value) return "";
  const cleaned = value.trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

const MONTH_ABBREV = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format an ISO date (YYYY-MM-DD) the same way the backend does:
 * "Mar 5, 2026". Avoids ``new Date()`` timezone shifts by parsing the
 * components directly.
 */
function formatIsoDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split("-");
  if (!yyyy || !mm || !dd) return iso;
  const monthIdx = Number.parseInt(mm, 10) - 1;
  const day = Number.parseInt(dd, 10);
  if (Number.isNaN(monthIdx) || Number.isNaN(day) || monthIdx < 0 || monthIdx > 11) {
    return iso;
  }
  return `${MONTH_ABBREV[monthIdx]} ${day}, ${yyyy}`;
}

function formatDates(start: string | null, end: string | null): string {
  if (!start && !end) return FALLBACK_DATES_BOTH;
  if (!start && end) return `until ${formatIsoDate(end)}`;
  if (start && !end) return `starting ${formatIsoDate(start)}`;
  return `${formatIsoDate(start as string)} to ${formatIsoDate(end as string)}`;
}

export interface RenderTemplateContext {
  templateSubject: string;
  templateBody: string;
  inquirerName: string | null;
  inquirerEmployer: string | null;
  listingTitle: string | null;
  listingPetsOnPremises: boolean;
  listingLargeDogDisclosure: string | null;
  desiredStartDate: string | null; // ISO yyyy-mm-dd
  desiredEndDate: string | null;
  hostName: string;
  hostPhone: string | null;
}

export interface RenderTemplateResult {
  subject: string;
  body: string;
}

export function renderTemplate(ctx: RenderTemplateContext): RenderTemplateResult {
  const substitutions: Record<string, string> = {
    "$name": sanitize(ctx.inquirerName, MAX_NAME) || FALLBACK_NAME,
    "$listing": sanitize(ctx.listingTitle, MAX_LISTING) || FALLBACK_LISTING,
    "$dates": formatDates(ctx.desiredStartDate, ctx.desiredEndDate),
    "$start_date": ctx.desiredStartDate
      ? formatIsoDate(ctx.desiredStartDate)
      : FALLBACK_START_DATE,
    "$end_date": ctx.desiredEndDate
      ? formatIsoDate(ctx.desiredEndDate)
      : FALLBACK_END_DATE,
    "$employer": sanitize(ctx.inquirerEmployer, MAX_EMPLOYER),
    "$host_name": sanitize(ctx.hostName, MAX_HOST_NAME),
    "$host_phone": sanitize(ctx.hostPhone, MAX_HOST_PHONE),
  };

  const keys = Object.keys(substitutions).sort((a, b) => b.length - a.length);
  let subject = ctx.templateSubject;
  let body = ctx.templateBody;
  for (const key of keys) {
    subject = subject.split(key).join(substitutions[key]);
    body = body.split(key).join(substitutions[key]);
  }

  if (
    ctx.listingPetsOnPremises &&
    ctx.listingLargeDogDisclosure &&
    ctx.listingLargeDogDisclosure.trim()
  ) {
    body = `${ctx.listingLargeDogDisclosure.trim()}\n\n${body}`;
  }

  return { subject, body };
}
