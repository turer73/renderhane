/**
 * In-memory stand-in for the Supabase service-role client, covering exactly
 * the query shapes the Model Lab modules use. It enforces what the migration
 * enforces: the per-user unique client request id and deletion-claim key
 * (Postgres error 23505), and no DELETE on model_lab_runs for the service
 * role. `hooks.gate` lets a test pause any statement to force an interleaving.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Mode = "select" | "insert" | "update" | "delete";

export type LabFakeGate = (table: string, mode: Mode, payload: Row | null) => Promise<void> | void;

const RUNS = "model_lab_runs";
const CLAIMS = "model_lab_input_deletions";

function isSubset(needle: unknown, haystack: unknown): boolean {
  if (Array.isArray(needle)) {
    return Array.isArray(haystack) && needle.every((item) => haystack.some((candidate) => isSubset(item, candidate)));
  }
  if (needle && typeof needle === "object") {
    return Boolean(haystack) && typeof haystack === "object" &&
      Object.entries(needle).every(([key, value]) => isSubset(value, (haystack as Row)[key]));
  }
  return needle === haystack;
}

/** A pause point: the paused side awaits `opened`; the test awaits `arrived`, then calls `release`. */
export function barrier() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void;
  const arrived = new Promise<void>((resolve) => { reached = resolve; });
  return { opened, release, arrived, reached };
}

export function createFakeLabAdmin() {
  // Timestamps follow Date.now() (so vi.setSystemTime moves them) and are
  // strictly increasing per fake, which keeps created_at ordering deterministic.
  let last = 0;
  const tick = () => {
    last = Math.max(Date.now(), last + 1);
    return new Date(last).toISOString();
  };
  const rows: Row[] = [];
  const claims: Row[] = [];
  const objects = new Map<string, { bytes: number; contentType?: string; createdAt: string }>();
  const calls = { uploads: [] as string[], removes: [] as string[][], signs: 0, lists: [] as string[] };
  const failures = { insert: false, upload: false, remove: false, sign: false, list: false, count: false, claims: false };
  const hooks: { gate: LabFakeGate | null } = { gate: null };
  let sequence = 0;

  function query(table: string) {
    if (table !== RUNS && table !== CLAIMS) throw new Error(`Unexpected table ${table}`);
    const store = table === RUNS ? rows : claims;
    const filters: Filter[] = [];
    let mode: Mode = "select";
    let payload: Row | null = null;
    let order: Array<{ column: string; ascending: boolean }> = [];
    let limit = Infinity;
    let countHead = false;

    const matching = () => store.filter((row) => filters.every((filter) => filter(row)));
    const sorted = (list: Row[]) => [...list].sort((a, b) => {
      for (const { column, ascending } of order) {
        const left = String(a[column]);
        const right = String(b[column]);
        if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });

    function run(): { data: unknown; error: { code?: string; message: string } | null; count?: number } {
      if (table === CLAIMS && failures.claims) return { data: null, error: { code: "08006", message: "connection failure" } };
      if (mode === "insert") {
        if (table === CLAIMS) {
          if (claims.some((row) => row.user_id === payload!.user_id && row.path === payload!.path)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          claims.push({ created_at: tick(), ...payload });
          return { data: null, error: null };
        }
        if (failures.insert) return { data: null, error: { code: "08006", message: "connection failure" } };
        const duplicate = rows.some((row) => row.user_id === payload!.user_id && row.client_request_id === payload!.client_request_id);
        if (duplicate) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        const created = tick();
        const row: Row = {
          id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
          request_id: null, receipt: null, inputs: [], outputs: [], storage_state: "none", storage_lease_until: null,
          error_code: null, error_message: null, completed_at: null, deleted_at: null,
          created_at: created, updated_at: created,
          expires_at: new Date(Date.parse(created) + 30 * 86_400_000).toISOString(),
          ...payload,
        };
        rows.push(row);
        return { data: { ...row }, error: null };
      }
      if (mode === "update") {
        const targets = matching();
        for (const row of targets) Object.assign(row, payload, { updated_at: tick() });
        return { data: targets.map((row) => ({ ...row })), error: null };
      }
      if (mode === "delete") {
        // Mirrors the migration: the service role cannot hard-delete history rows.
        if (table === RUNS) return { data: null, error: { code: "42501", message: "permission denied for table model_lab_runs" } };
        for (const row of matching()) store.splice(store.indexOf(row), 1);
        return { data: null, error: null };
      }
      const found = sorted(matching()).slice(0, limit);
      if (countHead) {
        if (failures.count) return { data: null, error: { code: "08006", message: "connection failure" }, count: undefined };
        return { data: null, error: null, count: found.length };
      }
      return { data: found.map((row) => ({ ...row })), error: null };
    }

    const execute = async () => {
      await hooks.gate?.(table, mode, payload);
      return run();
    };

    const builder = {
      insert(value: Row) { mode = "insert"; payload = value; return builder; },
      update(value: Row) { mode = "update"; payload = value; return builder; },
      delete() { mode = "delete"; return builder; },
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        if (options?.head) countHead = true;
        return builder;
      },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      neq(column: string, value: unknown) { filters.push((row) => row[column] !== value); return builder; },
      is(column: string, value: null) { filters.push((row) => (row[column] ?? null) === value); return builder; },
      abortSignal(signal: AbortSignal) { signal.throwIfAborted(); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      lt(column: string, value: string) { filters.push((row) => String(row[column]) < value); return builder; },
      contains(column: string, value: unknown) { filters.push((row) => isSubset(value, row[column])); return builder; },
      order(column: string, options?: { ascending?: boolean }) { order = [...order, { column, ascending: options?.ascending ?? true }]; return builder; },
      limit(value: number) { limit = value; return builder; },
      async single() {
        const result = await execute();
        const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data, error: result.error ?? (data ? null : { code: "PGRST116", message: "no rows" }) };
      },
      async maybeSingle() {
        const result = await execute();
        const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data, error: result.error };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return execute().then(resolve, reject);
      },
    };
    return builder;
  }

  const storage = {
    from(bucket: string) {
      if (bucket !== "uploads") throw new Error(`Unexpected bucket ${bucket}`);
      return {
        async upload(path: string, body: Uint8Array, options?: { contentType?: string }) {
          calls.uploads.push(path);
          if (failures.upload) return { data: null, error: { message: "storage unavailable" } };
          objects.set(path, { bytes: body.byteLength, contentType: options?.contentType, createdAt: tick() });
          return { data: { path }, error: null };
        },
        async createSignedUrls(paths: string[], expiresIn: number, options?: { download?: boolean | string }) {
          calls.signs++;
          if (failures.sign) return { data: null, error: { message: "sign failed" } };
          return {
            data: paths.map((path) => ({
              path,
              error: objects.has(path) ? null : "Object not found",
              signedUrl: `https://proj.supabase.co/storage/v1/object/sign/uploads/${path}?token=t${calls.signs}&ttl=${expiresIn}${options?.download ? "&download=" : ""}`,
            })),
            error: null,
          };
        },
        async list(folder: string, options?: { limit?: number; sortBy?: { column: string; order: string } }) {
          calls.lists.push(folder);
          if (failures.list) return { data: null, error: { message: "list failed" } };
          const entries = [...objects.entries()]
            .filter(([path]) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/"))
            .map(([path, object]) => ({ id: `obj:${path}`, name: path.slice(folder.length + 1), created_at: object.createdAt }))
            .sort((a, b) => (a.created_at < b.created_at ? -1 : 1) * (options?.sortBy?.order === "desc" ? -1 : 1));
          return { data: entries.slice(0, options?.limit ?? 100), error: null };
        },
        async remove(paths: string[]) {
          calls.removes.push([...paths]);
          if (failures.remove) return { data: null, error: { message: "remove failed" } };
          for (const path of paths) objects.delete(path);
          return { data: [], error: null };
        },
      };
    },
  };

  /** Put an object in the fake bucket, e.g. an upload the panel made directly. */
  const seedObject = (path: string, createdAt = tick()) => objects.set(path, { bytes: 1, createdAt });

  return { client: { from: query, storage }, rows, claims, objects, calls, failures, hooks, seedObject };
}
