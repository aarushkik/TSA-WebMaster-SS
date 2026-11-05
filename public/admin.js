const base = location.pathname.replace(/\/$/, '');
const $ = id => document.getElementById(id);
let scores = [];
let paused = false;
function message(text, error = false) {
  $('admin-status').textContent = text;
  $('admin-status').classList.toggle('error', error);
}
async function api(path, method = 'GET', data) {
  const response = await fetch(path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result;
}
function el(tag, text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
async function action(button, task) {
  button.disabled = true;
  try { await task(); } catch (error) { message(error.message, true); } finally { button.disabled = false; }
}
async function refresh() {
  const [history, board] = await Promise.all([api(`${base}/scores`), api('/api/leaderboard')]);
  scores = history.scores;
  paused = board.paused;
  $('pause').disabled = false;
  $('export').disabled = false;
  $('pause').textContent = paused ? 'Resume submissions' : 'Pause submissions';
  $('pause-state').textContent = paused ? 'Submissions are paused. Game-engine posts receive a 409 response.' : 'Submissions are open. Game-engine scores are accepted.';
  $('score-total').textContent = `${scores.length} SCORES`;
  $('history-empty').hidden = scores.length > 0;
  $('history').replaceChildren(...scores.map(entry => {
    const row = el('tr');
    const nameCell = el('td'); const name = el('input'); name.value = entry.name; name.maxLength = 60; name.setAttribute('aria-label', `Team name for ${entry.name}`); nameCell.append(name);
    const scoreCell = el('td'); const score = el('input'); score.value = entry.score; score.type = 'number'; score.step = '1'; score.setAttribute('aria-label', `Score for ${entry.name}`); scoreCell.append(score);
    const actions = el('td'); const group = el('div'); group.className = 'admin-actions';
    const save = el('button', 'Save'); const remove = el('button', 'Delete'); save.className = 'button'; remove.className = 'button danger';
    save.addEventListener('click', () => action(save, async () => {
      if (!name.value.trim() || !score.value.trim() || !Number.isSafeInteger(Number(score.value))) throw new Error('Enter a team name and a valid integer score.');
      await api(`${base}/scores/${entry.id}`, 'PATCH', { name: name.value, score: Number(score.value) });
      await refresh(); message('Score updated. The leaderboard has been recalculated.');
    }));
    remove.addEventListener('click', () => {
      if (!confirm(`Delete ${entry.name}’s score of ${entry.score}? This cannot be undone.`)) return;
      action(remove, async () => { await api(`${base}/scores/${entry.id}`, 'DELETE'); await refresh(); message('Score deleted.'); });
    });
    group.append(save, remove); actions.append(group);
    row.append(nameCell, scoreCell, el('td', new Date(entry.created_at).toLocaleString()), actions);
    return row;
  }));
}
$('score-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    await api(`${base}/scores`, 'POST', { name: $('name').value, score: Number($('score').value) });
    $('score-form').reset(); await refresh(); message('Score added.'); $('name').focus();
  });
});
$('pause').addEventListener('click', event => action(event.currentTarget, async () => {
  await api(`${base}/settings`, 'POST', { paused: !paused }); await refresh(); message(paused ? 'Submissions paused.' : 'Submissions resumed.');
}));
$('refresh').addEventListener('click', event => action(event.currentTarget, async () => { await refresh(); message('Scores refreshed.'); }));
$('reset-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    await api(`${base}/reset`, 'POST', { confirmation: $('confirmation').value });
    $('reset-form').reset(); await refresh(); message('Tournament reset. Submissions are open.');
  });
});
$('export').addEventListener('click', event => action(event.currentTarget, async () => {
  // Fetch fresh data without discarding unsaved edits in the visible table.
  const data = (await api(`${base}/scores`)).scores;
  const cell = value => `"${String(value).replaceAll('"', '""')}"`;
  const lines = [['id', 'name', 'score', 'created_at'], ...data.map(entry => [entry.id, /^[=+\-@\t\r]/.test(entry.name) ? `'${entry.name}` : entry.name, entry.score, entry.created_at])];
  const url = URL.createObjectURL(new Blob([lines.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = el('a'); link.href = url; link.download = `space-battle-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); message('CSV exported.');
}));
refresh().then(() => message('Arena control ready.')).catch(error => message(error.message, true));
