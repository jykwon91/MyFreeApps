/** Mirrors backend ``LanguageResponse`` (app/schemas/tutor/catalog_schemas.py). */
export interface Language {
  code: string;
  display_name: string;
  dialect_label: string;
  stt_locale: string;
  tts_locale: string;
}
