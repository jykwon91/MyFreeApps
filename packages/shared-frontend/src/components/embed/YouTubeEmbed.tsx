import { cn } from "../../utils/cn";

interface Props {
  /** YouTube video ID. When omitted, a "coming soon" placeholder renders instead of an iframe. */
  videoId?: string;
  title?: string;
  className?: string;
}

/**
 * Responsive 16:9 YouTube embed using the privacy-friendly nocookie host.
 * The app CSP must allow `frame-src https://www.youtube-nocookie.com`.
 */
export default function YouTubeEmbed({ videoId, title = "Inspiration video", className }: Props) {
  if (!videoId) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground",
          className,
        )}
      >
        Video coming soon
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg bg-black", className)}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
