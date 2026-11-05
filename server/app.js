// Keep this path out of public pages. There is intentionally no login for this event.
export const ADMIN_PATH = '/control-room-7f3c9a';
const headers = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { ...headers, 'Content-Type': 'application/json', ...extra },
});
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
async function body(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail('Use Content-Type: application/json.', 415);
  const reader = request.body?.getReader();
  let size = 0;
  const chunks = [];
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); fail('Request body is too large (maximum 8 KB).', 413); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('Send valid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Send a JSON object.');
  return data;
}
function validateScore(data) {
  if (typeof data.name !== 'string') fail('name must be a nonempty string.');
  const name = data.name.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) fail('name must contain 1–60 printable characters.');
  if (!Number.isSafeInteger(data.score)) fail('score must be a safe integer, not a string or decimal.');
  return { name, team_key: name.toLowerCase(), score: data.score };
}
export async function handle(request, db, assets) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  const isAdmin = path === ADMIN_PATH || path.startsWith(`${ADMIN_PATH}/`);
  const cors = path === '/api/scores' ? { 'Access-Control-Allow-Origin': '*' } : {};
  try {
    if (path === '/api/scores' && method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (isAdmin && !['GET', 'HEAD'].includes(method)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) fail('Admin requests must come from this site.', 403);
    }
    if (path === '/api/leaderboard' && method === 'GET') {
      // A single snapshot keeps the ranking, totals, and recent feed consistent.
      const [{ results: scores }, { results: settings }] = await db.batch([
        db.prepare('SELECT * FROM scores ORDER BY created_at DESC, rowid DESC'),
        db.prepare('SELECT paused FROM settings WHERE id = 1'),
      ]);
      const teams = new Map();
      for (const entry of scores) {
        let team = teams.get(entry.team_key);
        if (!team) {
          team = { name: entry.name, best: entry.score, latest: entry.score, attempts: 0 };
          teams.set(entry.team_key, team);
        }
        team.best = Math.max(team.best, entry.score);
        team.attempts++;
      }
      const ranked = [...teams.values()].sort((a, b) => b.best - a.best || a.name.localeCompare(b.name));
      ranked.forEach((team, i) => { team.rank = i > 0 && team.best === ranked[i - 1].best ? ranked[i - 1].rank : i + 1; });
      return json({ teams: ranked, recent: scores.slice(0, 10), totalScores: scores.length, paused: Boolean(settings[0]?.paused), updatedAt: new Date().toISOString() });
    }
    if (path === '/api/scores' && method === 'POST' || path === `${ADMIN_PATH}/scores` && method === 'POST') {
      const data = validateScore(await body(request));
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      // Check pause and insert atomically, including when a coordinator pauses mid-request.
      const result = await db.prepare(`INSERT INTO scores (id, name, team_key, score, created_at)
        SELECT ?, ?, ?, ?, ? WHERE ? = 1 OR COALESCE((SELECT paused FROM settings WHERE id = 1), 0) = 0`)
        .bind(id, data.name, data.team_key, data.score, createdAt, isAdmin ? 1 : 0).run();
      if (!result.meta.changes) fail('Score submissions are paused. Try again when the coordinator resumes the event.', 409);
      return json({ id, name: data.name, score: data.score, createdAt }, 201, cors);
    }
    if (path === `${ADMIN_PATH}/scores` && method === 'GET') {
      const { results } = await db.prepare('SELECT id, name, score, created_at FROM scores ORDER BY created_at DESC, rowid DESC').all();
      return json({ scores: results });
    }
    if (path.startsWith(`${ADMIN_PATH}/scores/`) && ['PATCH', 'DELETE'].includes(method)) {
      const id = path.slice(`${ADMIN_PATH}/scores/`.length);
      let result;
      if (method === 'DELETE') result = await db.prepare('DELETE FROM scores WHERE id = ?').bind(id).run();
      else {
        const data = validateScore(await body(request));
        result = await db.prepare('UPDATE scores SET name = ?, team_key = ?, score = ? WHERE id = ?').bind(data.name, data.team_key, data.score, id).run();
      }
      if (!result.meta.changes) fail('Score not found. Refresh and try again.', 404);
      return json({ ok: true });
    }
    if (path === `${ADMIN_PATH}/settings` && method === 'POST') {
      const data = await body(request);
      if (typeof data.paused !== 'boolean') fail('paused must be true or false.');
      await db.prepare('INSERT INTO settings (id, paused) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET paused = excluded.paused').bind(Number(data.paused)).run();
      return json({ paused: data.paused });
    }
    if (path === `${ADMIN_PATH}/reset` && method === 'POST') {
      if ((await body(request)).confirmation !== 'RESET') fail('Type RESET to confirm.');
      await db.batch([db.prepare('DELETE FROM scores'), db.prepare('DELETE FROM settings')]);
      return json({ ok: true });
    }
    const assetPath = path === '/' ? '/index.html' : path === ADMIN_PATH ? '/admin.html' : path;
    // Admin HTML is served only at the unlisted route.
    if ((path !== '/admin.html') && assets[assetPath] && ['GET', 'HEAD'].includes(method)) {
      const asset = assets[assetPath];
      return new Response(method === 'HEAD' ? null : asset.body, { headers: { ...headers, 'Content-Type': asset.type, ...(isAdmin ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) } });
    }
    return json({ error: 'Not found.' }, 404, cors);
  } catch (error) {
    if (!error.status) console.error(error);
    return json({ error: error.status ? error.message : 'The server could not complete the request. Please try again.' }, error.status || 500, cors);
  }
}
