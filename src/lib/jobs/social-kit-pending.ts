interface StoredPendingOperation {
  version: 1;
  idempotencyKey: string;
  createdAt: string;
}

const PENDING_STORAGE_PREFIX = "renderhane:social-kit:v2";

function storageKey(userId: string) {
  return `${PENDING_STORAGE_PREFIX}:${userId}`;
}

function readPendingOperations(
  storage: Storage,
  userId: string
): Record<string, StoredPendingOperation> {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredPendingOperation>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function getPendingIdempotencyKey(
  storage: Storage,
  userId: string,
  requestScope: string
): string | null {
  const entry = readPendingOperations(storage, userId)[requestScope];
  return entry?.version === 1 &&
    typeof entry.idempotencyKey === "string" &&
    entry.idempotencyKey.length >= 8 &&
    entry.idempotencyKey.length <= 128
    ? entry.idempotencyKey
    : null;
}

export function rememberPendingIdempotencyKey(
  storage: Storage,
  userId: string,
  requestScope: string,
  idempotencyKey: string
) {
  try {
    const key = storageKey(userId);
    const entries = readPendingOperations(storage, userId);
    entries[requestScope] = {
      version: 1,
      idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    storage.setItem(key, JSON.stringify(entries));
  } catch {
    // The page keeps the same key in memory when browser storage is disabled.
  }
}

export function forgetPendingIdempotencyKey(
  storage: Storage,
  userId: string,
  requestScope: string,
  idempotencyKey: string
) {
  try {
    const key = storageKey(userId);
    const entries = readPendingOperations(storage, userId);
    if (entries[requestScope]?.idempotencyKey !== idempotencyKey) return;
    delete entries[requestScope];
    if (Object.keys(entries).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(entries));
  } catch {
    // Fail closed: an uncleared key can replay but cannot double-charge.
  }
}
