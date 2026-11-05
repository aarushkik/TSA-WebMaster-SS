import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle, ADMIN_PATH, openDatabase } from '../server.js';
import { readFileSync } from 'node:fs';
const assets = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function request(db, path, method = 'GET', data, extra = {}) {
  return handle(new Request(`http://localhost${path}`, { method, headers: { 'Content-Type': 'application/json', ...extra }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), db, assets);
}
test('ingest, ranking, ties, negatives, and name normalization', async () => {
  const db = await openDatabase(':memory:');
  try {
    for (const data of [{ name: '  Orbit   Crew ', score: -250 }, { name: 'orbit crew', score: 750 }, { name: 'Comet', score: 750 }, { name: 'Nebula', score: -300 }]) assert.equal((await request(db, '/api/scores', 'POST', data)).status, 201);
    const board = await (await request(db, '/api/leaderboard')).json();
    assert.equal(board.totalScores, 4); assert.equal(board.teams.length, 3);
    assert.deepEqual(board.teams.map(t => t.rank), [1, 1, 3]);
    assert.equal(board.teams.find(t => t.name === 'orbit crew').attempts, 2);
    assert.equal(board.teams[2].best, -300);
  } finally { db.close(); }
});
test('reject invalid payloads but accept zero and scores outside typical range', async () => {
  const db = await openDatabase(':memory:');
  try {
    for (const data of [null, [], {}, { name: '', score: 1 }, { name: 'a'.repeat(61), score: 1 }, { name: 'Bot', score: '10' }, { name: 'Bot', score: 1.2 }, { name: 'Bot', score: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal((await request(db, '/api/scores', 'POST', data)).status, 400);
    const malformed = new Request('http://localhost/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal((await handle(malformed, db, assets)).status, 400);
    assert.equal((await request(db, '/api/scores', 'POST', { name: 'Bot', score: 0 })).status, 201);
    assert.equal((await request(db, '/api/scores', 'POST', { name: 'Bot', score: -9000 })).status, 201);
    assert.equal((await request(db, '/api/scores', 'POST', { name: 'Bot', score: 1 }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request(db, '/api/scores', 'POST', { name: 'x'.repeat(9000), score: 1 })).status, 413);
    assert.equal((await request(db, '/api/scores', 'OPTIONS')).status, 204);
  } finally { db.close(); }
});
test('pause, manual scores, corrections, deletion, reset, and admin isolation', async () => {
  const db = await openDatabase(':memory:');
  try {
    assert.equal((await request(db, ADMIN_PATH)).status, 200);
    assert.equal((await request(db, '/admin.html')).status, 404);
    assert.ok(!assets.includes(ADMIN_PATH));
    assert.equal((await request(db, `${ADMIN_PATH}/settings`, 'POST', { paused: true }, { Origin: 'https://other.example' })).status, 403);
    await request(db, `${ADMIN_PATH}/settings`, 'POST', { paused: true });
    assert.equal((await request(db, '/api/scores', 'POST', { name: 'Bot', score: 100 })).status, 409);
    const score = await (await request(db, `${ADMIN_PATH}/scores`, 'POST', { name: 'Bot', score: 100 })).json();
    assert.equal((await request(db, `${ADMIN_PATH}/scores/${score.id}`, 'PATCH', { name: 'Bot II', score: -50 })).status, 200);
    assert.equal((await (await request(db, '/api/leaderboard')).json()).teams[0].best, -50);
    assert.equal((await request(db, `${ADMIN_PATH}/scores/${score.id}`, 'DELETE')).status, 200);
    assert.equal((await request(db, `${ADMIN_PATH}/scores/${score.id}`, 'DELETE')).status, 404);
    await request(db, `${ADMIN_PATH}/scores`, 'POST', { name: 'Bot', score: 12 });
    assert.equal((await request(db, `${ADMIN_PATH}/reset`, 'POST', { confirmation: 'no' })).status, 400);
    assert.equal((await request(db, `${ADMIN_PATH}/reset`, 'POST', { confirmation: 'RESET' })).status, 200);
    const board = await (await request(db, '/api/leaderboard')).json();
    assert.equal(board.totalScores, 0); assert.equal(board.paused, false);
  } finally { db.close(); }
});
test('scores survive database restart and concurrent submissions are preserved', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'space-battle-'));
  const path = join(directory, 'scores.sqlite');
  let db = await openDatabase(path);
  try {
    await Promise.all(Array.from({ length: 20 }, (_, i) => request(db, '/api/scores', 'POST', { name: `Bot ${i}`, score: i })));
    db.close(); db = await openDatabase(path);
    const board = await (await request(db, '/api/leaderboard')).json();
    assert.equal(board.totalScores, 20); assert.equal(board.teams[0].best, 19);
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});
