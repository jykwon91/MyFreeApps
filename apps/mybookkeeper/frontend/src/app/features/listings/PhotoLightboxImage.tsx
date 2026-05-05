export interface PhotoLightboxImageProps {
  src: string;
  alt: string;
}

export default function PhotoLightboxImage({ src, alt }: PhotoLightboxImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      className="max-w-[90vw] max-h-[90vh] object-contain select-none"
      draggable={false}
      data-testid="photo-lightbox-image"
    />
  );
}
