const $ = id => document.getElementById(id);
const number = value => value.toLocaleString('en-US');
let state = null;
let lastSuccess = null;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render() {
  if (!state) return;
  const query = $('search').value.trim().toLowerCase();
  const teams = state.teams.filter(team => team.name.toLowerCase().includes(query));
  $('team-count').textContent = number(state.teams.length);
  $('score-count').textContent = number(state.totalScores);
  $('best-score').replaceChildren(document.createTextNode(state.teams.length ? number(state.teams[0].best) : '—'), element('span', 'PTS'));
  const leaders = state.teams.filter(team => team.rank === 1);
  $('best-team').textContent = leaders.length > 1 ? `${leaders.length} teams tied for first` : leaders[0]?.name || 'The arena is waiting';
  $('event-state').textContent = state.paused ? 'Submissions paused' : state.totalScores ? 'Arena live · scores rolling in' : 'Arena ready · awaiting first score';
  $('event-dot').classList.toggle('paused', state.paused);
  $('result-count').textContent = `${teams.length} ${teams.length === 1 ? 'team' : 'teams'}${query ? ` / ${state.teams.length}` : ''}`;
  $('rankings').replaceChildren(...teams.map(team => {
    const row = element('tr', undefined, team.rank === 1 ? 'leader' : '');
    const rank = element('td', undefined, 'rank');
    rank.append(element('span', String(team.rank).padStart(2, '0'), 'rank-badge'));
    row.append(rank, element('td', team.name, 'team'), element('td', number(team.attempts), 'number'), element('td', number(team.latest), 'number'), element('td', number(team.best), 'number score'));
    return row;
  }));
  $('empty').hidden = teams.length > 0;
  $('empty').querySelector('h3').textContent = query ? 'No matching teams.' : 'Ready for the first run.';
  $('empty').querySelector('p').textContent = query ? 'Try another name or clear the search.' : 'Team scores will appear here as they arrive from the arena.';
  $('recent-empty').hidden = state.recent.length > 0;
  $('recent-list').replaceChildren(...state.recent.map(score => {
    const item = element('li');
    const info = element('div', undefined, 'feed-info');
    const date = new Date(score.created_at);
    const time = element('time', date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    time.dateTime = score.created_at;
    time.title = date.toLocaleString();
    info.append(element('strong', score.name), time);
    item.append(element('span', '↗', 'feed-icon'), info, element('span', number(score.score), `feed-score${score.score < 0 ? ' negative' : ''}`));
    return item;
  }));
}
async function refresh() {
  try {
    const response = await fetch('/api/leaderboard', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Could not fetch scores');
    state = await response.json();
    lastSuccess = new Date();
    $('connection').textContent = 'Live updates';
    $('connection').className = 'connection online';
    $('connection-error').hidden = true;
    render();
  } catch {
    $('connection').textContent = 'Reconnecting…';
    $('connection').className = 'connection';
    $('connection-error').hidden = false;
    $('connection-error').textContent = lastSuccess ? `Connection lost. Showing scores from ${lastSuccess.toLocaleTimeString()}. Retrying automatically…` : 'Unable to load scores. Checking the connection again automatically…';
    $('event-state').textContent = 'Connection interrupted';
    $('event-dot').classList.add('paused');
  } finally { setTimeout(refresh, 3000); }
}
$('search').addEventListener('input', render);
$('projector').addEventListener('click', () => {
  const active = document.body.classList.toggle('projector');
  $('projector').textContent = active ? '↙  Exit projector view' : '⛶  Projector view';
  $('projector').setAttribute('aria-pressed', String(active));
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('projector')) $('projector').click(); });
refresh();
