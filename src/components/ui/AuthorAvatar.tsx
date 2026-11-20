import type { Author } from "@/content/types";

/** Author photo from the CMS, or a brand monogram when none is uploaded. */
export function AuthorAvatar({ author, size = 40 }: { author: Author; size?: number }) {
  if (author.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny avatar, CMS-sized
      <img
        src={author.avatar.src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        loading="lazy"
      />
    );
  }
  const initial = author.name.replace(/^Redaksi\s+/i, "").charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="font-display inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white italic"
      style={{ width: size, height: size, fontSize: size * 0.48 }}
    >
      {initial}
    </span>
  );
}
