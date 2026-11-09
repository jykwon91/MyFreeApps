/**
 * The property_id the summary gives transactions that belong to no property. It is not a UUID,
 * so a list of those rows is asked for with `unassigned=true` instead. Matches the backend's
 * app/core/property_constants.py::UNASSIGNED_PROPERTY_ID.
 */
export const UNASSIGNED_PROPERTY_ID = "unassigned";
