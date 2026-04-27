/**
 * Source platforms an inquiry can originate from.
 *
 * Mirrors backend ``INQUIRY_SOURCES`` in ``app/core/inquiry_enums.py``. Note
 * that this differs from ``ListingSource`` — listings track Airbnb (paid
 * channel) while inquiries don't (Airbnb inquiries don't reach our Gmail
 * inbox), but inquiries DO track ``"other"`` for one-off platforms (Zillow,
 * Apartments.com).
 */
export type InquirySource = "FF" | "TNH" | "direct" | "other";
