import { useState } from "react";
import { UserRound } from "lucide-react";
import { characterRenderUrl } from "@/games/wow-forever/lib/character/characterRenderUrl";

interface CharacterRenderProps {
  slug: string;
  name: string;
  hasRender: boolean;
}

/** Blizzard's picture of the character in their gear, or a plain placeholder when there's none. */
export default function CharacterRender({ slug, name, hasRender }: CharacterRenderProps) {
  const src = characterRenderUrl(slug);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = hasRender && failedSrc !== src;
  return (
    <figure className="flex h-72 items-end justify-center rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 p-3 sm:h-96">
      {showImage ? (
        <img
          src={src}
          alt={`${name} in their current gear`}
          className="max-h-full max-w-full object-contain drop-shadow-xl"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
          <UserRound className="h-16 w-16" aria-hidden />
          <figcaption className="text-sm">Blizzard has no picture of this character yet.</figcaption>
        </div>
      )}
    </figure>
  );
}
