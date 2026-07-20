import Markdown from "@/shared/components/ui/Markdown";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";

export interface WelcomeManualPreviewProps {
  title: string;
  introText: string | null;
  /** Sections already sorted by display_order. */
  sections: WelcomeManualSectionResponse[];
}

/**
 * Guest-facing preview of a welcome manual — the assembled view a guest sees
 * in the emailed PDF. Mirrors the backend PDF structure
 * (`welcome_manual_pdf_service.py`): centered title, intro markdown, then each
 * section's title, body markdown, and images with captions.
 *
 * Unlike the editor's inline `Markdown` bodies, section images here are the
 * real uploaded photos (rendered from their presigned URLs), not markdown
 * images — `Markdown` intentionally drops markdown `img` tags.
 */
export default function WelcomeManualPreview({
  title,
  introText,
  sections,
}: WelcomeManualPreviewProps) {
  return (
    <article
      className="bg-card border rounded-lg p-6 space-y-6"
      data-testid="welcome-manual-preview"
    >
      <h1 className="text-xl font-semibold text-center text-foreground">{title}</h1>

      {introText ? (
        <div data-testid="welcome-manual-preview-intro">
          <Markdown content={introText} />
        </div>
      ) : null}

      {sections.length > 0 ? (
        sections.map((section) => (
          <section
            key={section.id}
            className="space-y-2"
            data-testid="welcome-manual-preview-section"
            data-section-id={section.id}
          >
            <h2 className="text-base font-semibold text-foreground border-b pb-1">
              {section.title}
            </h2>

            {section.body ? <Markdown content={section.body} /> : null}

            {section.images.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2 list-none">
                {section.images.map((image) => (
                  <li key={image.id} className="space-y-1">
                    {image.is_available !== false && image.presigned_url ? (
                      <img
                        src={image.presigned_url}
                        alt={image.caption ?? `${section.title} photo`}
                        loading="lazy"
                        className="w-full rounded-md border object-cover"
                        data-testid="welcome-manual-preview-image"
                      />
                    ) : (
                      <div
                        className="w-full aspect-video rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground"
                        data-testid="welcome-manual-preview-image-missing"
                      >
                        Image unavailable
                      </div>
                    )}
                    {image.caption ? (
                      <p className="text-xs text-muted-foreground text-center">
                        {image.caption}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))
      ) : (
        <p
          className="text-sm text-muted-foreground text-center"
          data-testid="welcome-manual-preview-empty"
        >
          Add sections to see them here.
        </p>
      )}
    </article>
  );
}
