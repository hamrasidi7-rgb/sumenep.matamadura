// article.tags is a JSON array of strings in MariaDB (PostgreSQL used text[]).
// Prisma types the column as JsonValue; this is the one place that narrows it.
export function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}
