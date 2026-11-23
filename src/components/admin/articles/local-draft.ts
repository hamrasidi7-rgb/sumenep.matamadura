// Copy of unsaved editor changes in this browser (localStorage), so a lost
// connection, a crash or a closed tab never loses work. Cleared after every
// successful save. Only ever read back after the Admin confirms.

export interface LocalDraft<T> {
  fields: T;
  version: number;
  savedAt: string;
}

const PREFIX = "sumenep:artikel:";

export function draftKey(articleId: string | null): string {
  return `${PREFIX}${articleId ?? "baru"}`;
}

export function writeDraft<T>(key: string, fields: T, version: number): void {
  try {
    localStorage.setItem(key, JSON.stringify({ fields, version, savedAt: new Date().toISOString() }));
  } catch {
    // storage full or blocked: the server copy is still the safety net
  }
}

export function readDraft<T>(key: string): LocalDraft<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as LocalDraft<T>;
    return draft && typeof draft === "object" && draft.fields ? draft : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to do
  }
}
