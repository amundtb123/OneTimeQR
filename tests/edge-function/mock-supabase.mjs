// Minimal stand-in for @supabase/supabase-js backed by PGlite (real Postgres in WASM).
// Covers only the query-builder calls the Edge Function uses.

const db = () => globalThis.__db;

function sqlValue(v) {
  return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.cols = '*';
    this.filters = [];
    this.payload = null;
    this.mode = null;
    this.returning = false;
    this.count = false;
    this.orderBy = null;
    this.limitN = null;
    this.offsetN = null;
  }
  select(cols = '*', opts = {}) {
    if (this.op === 'select') { this.cols = cols; this.count = opts.count === 'exact'; }
    else { this.returning = true; this.cols = cols; }
    return this;
  }
  order(c, { ascending = true } = {}) { this.orderBy = `${c} ${ascending ? 'asc' : 'desc'}`; return this; }
  limit(n) { this.limitN = n; return this; }
  range(from, to) { this.offsetN = from; this.limitN = to - from + 1; return this; }
  insert(p) { this.op = 'insert'; this.payload = [].concat(p); return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push(['=', c, v]); return this; }
  in(c, v) { this.filters.push(['in', c, v]); return this; }
  like(c, v) { this.filters.push(['like', c, v]); return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  then(resolve, reject) { return this.exec().then(resolve, reject); }

  where(params) {
    if (this.filters.length === 0) return '';
    return ' where ' + this.filters.map(([op, c, v]) => {
      if (op === 'in') {
        if (v.length === 0) return 'false';
        return `${c} in (${v.map((x) => { params.push(x); return '$' + params.length; }).join(',')})`;
      }
      params.push(v);
      // PostgREST JSON path: value->>userId  ->  value->>'userId'
      return `${c.replace(/->>(\w+)$/, "->>'$1'")} ${op} $${params.length}`;
    }).join(' and ');
  }

  async exec() {
    try {
      const params = [];
      let sql;
      if (this.op === 'select') {
        sql = `select ${this.cols} from public.${this.table}` + this.where(params);
        if (this.orderBy) sql += ` order by ${this.orderBy}`;
        if (this.limitN !== null) sql += ` limit ${Number(this.limitN)}`;
        if (this.offsetN !== null) sql += ` offset ${Number(this.offsetN)}`;
      } else if (this.op === 'delete') {
        sql = `delete from public.${this.table}` + this.where(params);
      } else if (this.op === 'update') {
        const sets = Object.entries(this.payload).map(([k, v]) => { params.push(sqlValue(v)); return `${k} = $${params.length}`; });
        sql = `update public.${this.table} set ${sets.join(', ')}` + this.where(params);
      } else {
        const cols = Object.keys(this.payload[0]);
        const rows = this.payload.map((row) => '(' + cols.map((k) => { params.push(sqlValue(row[k])); return '$' + params.length; }).join(',') + ')');
        sql = `insert into public.${this.table} (${cols.join(',')}) values ${rows.join(',')}`;
      }
      if (this.op !== 'select' && this.returning) sql += ` returning ${this.cols}`;
      const { rows } = await db().query(sql, params);
      let count = null;
      if (this.count) {
        const countParams = [];
        count = (await db().query(`select count(*)::int as n from public.${this.table}` + this.where(countParams), countParams)).rows[0].n;
      }
      if (this.mode === 'single') {
        if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        return { data: rows[0], error: null };
      }
      if (this.mode === 'maybe') return { data: rows[0] ?? null, error: null };
      return { data: rows, count, error: null };
    } catch (e) {
      return { data: null, error: { code: e.code, message: e.message } };
    }
  }
}

export function createClient() {
  return {
    from: (table) => new Query(table),
    async rpc(name, args) {
      try {
        const keys = Object.keys(args);
        const { rows } = await db().query(
          `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
          keys.map((k) => args[k]),
        );
        return { data: rows[0].r, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
    auth: {
      async getUser(token) {
        const id = globalThis.__users[token];
        return id ? { data: { user: { id, email: 'test@example.test' } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
      },
    },
    storage: {
      listBuckets: async () => ({ data: [{ name: 'make-c3c9181e-qrdrop-files' }], error: null }),
      createBucket: async () => ({ data: {}, error: null }),
      from: () => ({
        upload: async (path, body) => {
          if (globalThis.__failStorageUpload) return { data: null, error: { message: 'storage unavailable' } };
          (globalThis.__files ??= new Map()).set(path, Buffer.from(body));
          return { data: {}, error: null };
        },
        remove: async (paths) => { for (const p of paths) globalThis.__files?.delete(p); return { data: {}, error: null }; },
        createSignedUrl: async (path) => ({ data: { signedUrl: `${globalThis.__storageBase ?? 'https://signed.test'}/${path}` }, error: null }),
      }),
    },
  };
}
