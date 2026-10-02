/**
 * In-memory stand-in for the Supabase service-role client, covering exactly
 * the query shapes the Model Lab modules use. It enforces the migration's
 * per-user unique client request id (Postgres error 23505) so idempotency is
 * tested against the same rule the database applies.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

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

export function createFakeLabAdmin() {
  // Timestamps follow Date.now() (so vi.setSystemTime moves them) and are
  // strictly increasing per fake, which keeps created_at ordering deterministic.
  let last = 0;
  const tick = () => {
    last = Math.max(Date.now(), last + 1);
    return new Date(last).toISOString();
  };
  const rows: Row[] = [];
  const objects = new Map<string, { bytes: number; contentType?: string; createdAt: string }>();
  const calls = { uploads: [] as string[], removes: [] as string[][], signs: 0, lists: [] as string[] };
  const failures = { insert: false, upload: false, remove: false, sign: false, list: false, count: false };
  let sequence = 0;

  function query(table: string) {
    if (table !== "model_lab_runs") throw new Error(`Unexpected table ${table}`);
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | null = null;
    let order: Array<{ column: string; ascending: boolean }> = [];
    let limit = Infinity;
    let countHead = false;

    const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
    const sorted = (list: Row[]) => [...list].sort((a, b) => {
      for (const { column, ascending } of order) {
        const left = String(a[column]);
        const right = String(b[column]);
        if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });

    function run(): { data: unknown; error: { code?: string; message: string } | null; count?: number } {
      if (mode === "insert") {
        if (failures.insert) return { data: null, error: { code: "08006", message: "connection failure" } };
        const duplicate = rows.some((row) => row.user_id === payload!.user_id && row.client_request_id === payload!.client_request_id);
        if (duplicate) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        const created = tick();
        const row: Row = {
          id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
          request_id: null, receipt: null, inputs: [], outputs: [], storage_state: "none",
          error_code: null, error_message: null, completed_at: null,
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
        for (const row of matching()) rows.splice(rows.indexOf(row), 1);
        return { data: null, error: null };
      }
      const found = sorted(matching()).slice(0, limit);
      if (countHead) {
        if (failures.count) return { data: null, error: { code: "08006", message: "connection failure" }, count: undefined };
        return { data: null, error: null, count: found.length };
      }
      return { data: found.map((row) => ({ ...row })), error: null };
    }

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
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      lt(column: string, value: string) { filters.push((row) => String(row[column]) < value); return builder; },
      contains(column: string, value: unknown) { filters.push((row) => isSubset(value, row[column])); return builder; },
      order(column: string, options?: { ascending?: boolean }) { order = [...order, { column, ascending: options?.ascending ?? true }]; return builder; },
      limit(value: number) { limit = value; return builder; },
      async single() {
        const result = run();
        const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data, error: result.error ?? (data ? null : { code: "PGRST116", message: "no rows" }) };
      },
      async maybeSingle() {
        const result = run();
        const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data, error: result.error };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
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

  return { client: { from: query, storage }, rows, objects, calls, failures, seedObject };
}
