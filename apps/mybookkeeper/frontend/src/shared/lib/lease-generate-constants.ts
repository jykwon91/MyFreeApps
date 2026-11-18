import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";

/** Field rows the generate-form skeleton shows when the field count isn't known yet (multi-template mode). */
export const MULTI_TEMPLATE_SKELETON_FIELD_COUNT = 4;

/**
 * Stages where generating a new lease makes sense:
 * - ``approved`` — landlord said yes, lease not yet sent
 * - ``lease_sent`` — lease sent but not yet counter-signed (may need a revision)
 *
 * Excluded: ``lease_signed`` (already executed), early funnel stages, ``declined``.
 * The server filters one stage per request, so the picker asks once per stage.
 */
export const LEASE_ELIGIBLE_STAGES: readonly ApplicantStage[] = ["approved", "lease_sent"];
