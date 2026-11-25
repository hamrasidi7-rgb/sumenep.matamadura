import "server-only";

import { unstable_cache } from "next/cache";

import { ARTICLES_TAG } from "@/server/articles/public";
import { getDb } from "@/server/db";

import { publicArticlesByAuthor, publicAuthorBySlug, publicAuthorsList } from "./queries";

export const cachedPublicAuthor = unstable_cache(
  (slug: string) => publicAuthorBySlug(getDb(), slug),
  ["public-author"],
  { tags: [ARTICLES_TAG], revalidate: 60 },
);

export const cachedPublicAuthors = unstable_cache(
  () => publicAuthorsList(getDb()),
  ["public-authors"],
  { tags: [ARTICLES_TAG], revalidate: 60 },
);

export const cachedPublicArticlesByAuthor = unstable_cache(
  (authorSlug: string) => publicArticlesByAuthor(getDb(), authorSlug),
  ["public-author-articles"],
  { tags: [ARTICLES_TAG], revalidate: 60 },
);
