interface ThemeImageProps {
  /** Image shown in light mode. */
  light: string;
  /** Image shown in dark mode. */
  dark: string;
  alt: string;
  /** Optional caption rendered under the image. */
  caption?: string;
  /** Intrinsic pixel width/height, used to reserve layout space. */
  width?: number;
  height?: number;
}

/**
 * Renders a screenshot that follows the docs light/dark theme. Both variants are
 * emitted; CSS shows only the one matching the active theme (the `dark` class on
 * the document root), so there is no flash or client JS required.
 */
export function ThemeImage({
  light,
  dark,
  alt,
  caption,
  width = 4002,
  height = 2154,
}: ThemeImageProps) {
  const imgClass =
    'w-full rounded-xl border border-fd-border shadow-sm';
  return (
    <figure className="not-prose my-6">
      <Image
        src={light}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        className={`${imgClass} block dark:hidden`}
      />
      <Image
        src={dark}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        className={`${imgClass} hidden dark:block`}
      />
      {caption ? (
        <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
import Image from "next/image";
