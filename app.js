const STORAGE_KEY = 'procrastinationTimer.v2';
const LEGACY_KEY = 'procrastinationTimer.v1';
const DEMO_SPEED = 60;

const badges = [
  { id: 'glance', icon: '👁️', name: 'The Quick Glance', description: 'You just meant to check one thing.', threshold: 60 },
  { id: 'distraction', icon: '☕', name: 'The Brief Distraction', description: 'Is that coffee brewing?', threshold: 300 },
  { id: 'wall', icon: '🧱', name: 'Master of Staring at the Wall', description: 'A truly riveting surface.', threshold: 900 },
  { id: 'rabbit', icon: '🐇', name: 'Rabbit Hole Explorer', description: 'Down the Wikipedia spiral.', threshold: 1800 },
  { id: 'evader', icon: '🛡️', name: 'Certified Task Evader', description: "Work doesn't stand a chance.", threshold: 3600 },
  { id: 'potato', icon: '🥔', name: 'Legendary Couch Potato', description: 'You have reached peak idleness.', threshold: 10800 }
];

const defaultState = { running: false, elapsed: 0, startedAt: null, speed: 1, lifetime: 0, sessions: [], unlocked: [], fastMode: false, urgency: false, alarmAt: null, alarmTriggeredAt: null, alarmRinging: false, alarmStartedTimer: false, lastAlarmReaction: null, alarmHistory: [] };
let state = loadState();
let ticker = null;
let alarmContext = null;
let alarmToneTimer = null;
const $ = id => document.getElementById(id);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return { ...defaultState, ...saved };
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (!legacy) return { ...defaultState };
    const migratedBadges = (legacy.unlocked || []).map(id => id === 'tabs' ? 'glance' : id).filter(id => badges.some(badge => badge.id === id));
    return { ...defaultState, elapsed: legacy.elapsed || 0, lifetime: (legacy.sessions || []).reduce((sum, session) => sum + (session.duration || 0), 0), sessions: legacy.sessions || [], unlocked: migratedBadges, urgency: Boolean(legacy.urgency), running: Boolean(legacy.running), startedAt: legacy.startedAt || null };
  } catch (error) { return { ...defaultState }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function formatTime(totalSeconds) { const total = Math.max(0, Math.floor(totalSeconds)); const hours = String(Math.floor(total / 3600)).padStart(2, '0'); const minutes = String(Math.floor(total % 3600 / 60)).padStart(2, '0'); const seconds = String(total % 60).padStart(2, '0'); return `${hours}:${minutes}:${seconds}`; }
function formatMinutes(seconds) { return `${Math.floor(seconds / 60).toLocaleString()}m`; }
function currentElapsed() { if (!state.running || !state.startedAt) return state.elapsed; return state.elapsed + ((Date.now() - state.startedAt) / 1000) * state.speed; }
function settleTimer() { state.elapsed = currentElapsed(); state.startedAt = state.running ? Date.now() : null; }
function totalProgress() { return state.lifetime + (state.running ? currentElapsed() : 0); }
function statusFor(seconds) { if (seconds >= 3600) return 'You have transcended productivity entirely.'; if (seconds >= 1800) return 'Down the rabbit hole, no map required.'; if (seconds >= 900) return 'Deep in the zone of unproductivity.'; if (seconds >= 300) return 'This is going surprisingly well.'; return 'Just getting started. Pace yourself.'; }
function nextBadge() { return badges.find(badge => !state.unlocked.includes(badge.id)); }

function renderBadges() {
  $('badgeGrid').innerHTML = badges.map(badge => { const unlocked = state.unlocked.includes(badge.id); return `<article class="badge ${unlocked ? 'unlocked' : ''}"><span class="badge-tag">${unlocked ? 'unlocked' : `${formatMinutes(badge.threshold)} needed`}</span><div class="badge-icon" aria-hidden="true">${badge.icon}</div><h3>${badge.name}</h3><p>${badge.description}</p></article>`; }).join('');
}
function checkBadges() {
  let newlyUnlocked = null;
  badges.forEach(badge => { if (!state.unlocked.includes(badge.id) && totalProgress() >= badge.threshold) { state.unlocked.push(badge.id); newlyUnlocked = badge; } });
  if (newlyUnlocked) { $('toastText').textContent = `${newlyUnlocked.name}: ${newlyUnlocked.description}`; $('toast').classList.add('show'); window.setTimeout(() => $('toast').classList.remove('show'), 5000); }
  saveState();
}
function renderProgress() {
  const badge = nextBadge(); const progress = totalProgress(); const current = badge ? Math.min(progress, badge.threshold) : progress; const percent = badge ? Math.min(100, current / badge.threshold * 100) : 100;
  $('progressBar').style.width = `${percent}%`; $('progressTrack').setAttribute('aria-valuenow', String(Math.floor(current))); $('progressLabel').textContent = badge ? `${formatMinutes(current)} / ${formatMinutes(badge.threshold)}` : 'All badges earned'; $('progressCopy').textContent = badge ? `${formatMinutes(Math.max(0, badge.threshold - progress))} until ${badge.name}. Keep avoiding.` : 'You have collected every badge. There is nowhere left to go but deeper into the couch.';
}
function renderAlarm() {
  const status = $('alarmStatus'); const result = $('alarmResult'); $('stopAlarmButton').disabled = !state.alarmAt && !state.alarmRinging; $('setAlarmButton').disabled = state.alarmRinging;
  if (state.alarmRinging) { const reactionSeconds = (Date.now() - state.alarmTriggeredAt) / 1000; status.textContent = `RINGING - stopwatch running for ${formatTime(reactionSeconds)}`; status.classList.add('ringing'); result.classList.toggle('roast', reactionSeconds >= 20); result.textContent = reactionSeconds >= 20 ? `You have taken ${formatTime(reactionSeconds)} to stop it. ${roastFor(reactionSeconds)}` : `Stop it before 00:00:20 to avoid a roast. ${formatTime(reactionSeconds)} elapsed.`; }
  else if (state.alarmAt) { status.classList.remove('ringing'); status.textContent = `Armed for ${new Date(state.alarmAt).toLocaleString()}`; result.textContent = state.lastAlarmReaction === null ? '' : `Last ignored alarm: ${formatTime(state.lastAlarmReaction)}`; }
  else { status.classList.remove('ringing'); status.textContent = 'No alarm set. Give yourself a deadline to ignore.'; result.classList.toggle('roast', state.lastAlarmReaction !== null && state.lastAlarmReaction >= 20); result.textContent = state.lastAlarmReaction === null ? '' : `Last alarm response: ${formatTime(state.lastAlarmReaction)}. ${state.lastAlarmReaction >= 20 ? roastFor(state.lastAlarmReaction) : 'Acceptable avoidance response time.'}`; }
  $('alarmHistory').innerHTML = state.alarmHistory.length ? state.alarmHistory.slice(-5).reverse().map(record => `<li><time datetime="${new Date(record.stoppedAt).toISOString()}">${new Date(record.stoppedAt).toLocaleString()}</time><strong>${formatTime(record.responseSeconds)}</strong></li>`).join('') : '<li>No alarm responses recorded yet.</li>';
}
function render() {
  const elapsed = currentElapsed(); const total = totalProgress(); const best = Math.max(elapsed, ...state.sessions.map(session => session.duration || 0), 0); document.body.classList.toggle('running', state.running);
  $('timerDisplay').textContent = formatTime(elapsed); $('statusText').textContent = statusFor(elapsed); $('startButton').textContent = state.running ? 'Keep procrastinating' : elapsed ? 'Resume procrastinating' : 'Start procrastinating'; $('stopButton').disabled = !state.running; $('modeLabel').textContent = state.running ? (state.speed === DEMO_SPEED ? 'demo mode' : 'tracking now') : 'standby'; $('sessionLabel').textContent = `session #${String(state.sessions.length + (state.running ? 1 : 0)).padStart(2, '0')}`;
  $('fastMode').checked = state.fastMode; $('urgencyToggle').checked = state.urgency; $('heroLifetime').textContent = formatMinutes(total); $('heroSessions').textContent = state.sessions.length + (state.running ? 1 : 0); $('heroBadges').textContent = `${state.unlocked.length}/6`; $('lifetimeStat').textContent = formatMinutes(total); $('bestStat').textContent = formatTime(best); $('sessionStat').textContent = state.sessions.length + (state.running ? 1 : 0); renderProgress(); renderBadges(); renderAlarm();
}
function ensureTicker() { if (!ticker) ticker = window.setInterval(() => { if (state.alarmAt && Date.now() >= state.alarmAt) triggerAlarm(); render(); checkBadges(); }, 1000); }
function maybeStopTicker() { if (!state.running && !state.alarmAt && !state.alarmRinging) { clearInterval(ticker); ticker = null; } }
function startTimer(speedOverride = null) { if (state.running) return; state.running = true; state.startedAt = Date.now(); state.speed = speedOverride ?? (state.fastMode ? DEMO_SPEED : 1); saveState(); ensureTicker(); render(); }
function stopTimer() { if (!state.running) return; settleTimer(); state.running = false; state.startedAt = null; state.lifetime += state.elapsed; state.sessions.push({ date: new Date().toISOString().slice(0, 10), duration: state.elapsed }); state.elapsed = 0; saveState(); maybeStopTicker(); render(); checkBadges(); }
function toggleFastMode(event) { if (state.running) settleTimer(); state.fastMode = event.target.checked; state.speed = state.fastMode ? DEMO_SPEED : 1; saveState(); ensureTicker(); render(); }
function roastFor(seconds) { if (seconds >= 120) return 'At this point the alarm has filed a missing-person report.'; if (seconds >= 60) return 'The alarm has now outperformed your entire workday.'; return 'Twenty seconds of warning and you still chose chaos.'; }
function alarmDateFromInput(value) { const [hours, minutes] = value.split(':').map(Number); const date = new Date(); date.setHours(hours, minutes, 0, 0); if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1); return date.getTime(); }
function playAlarmTone() { try { alarmContext = alarmContext || new (window.AudioContext || window.webkitAudioContext)(); const oscillator = alarmContext.createOscillator(); const gain = alarmContext.createGain(); oscillator.type = 'square'; oscillator.frequency.value = 740; gain.gain.setValueAtTime(.05, alarmContext.currentTime); oscillator.connect(gain); gain.connect(alarmContext.destination); oscillator.start(); oscillator.stop(alarmContext.currentTime + .22); } catch (error) {} }
function triggerAlarm() { if (!state.alarmAt || state.alarmRinging || Date.now() < state.alarmAt) return; state.alarmRinging = true; state.alarmTriggeredAt = Date.now(); state.alarmStartedTimer = !state.running; if (state.alarmStartedTimer) startTimer(1); saveState(); playAlarmTone(); clearInterval(alarmToneTimer); alarmToneTimer = window.setInterval(playAlarmTone, 700); $('alertTitle').textContent = '!! ALARM IGNORED !!'; $('alertMessage').textContent = 'Time to stop procrastinating. Click Stop alarm to silence the consequences.'; $('urgencyAlert').classList.add('show'); render(); }
function setAlarm() { const value = $('alarmInput').value; if (!value) { $('alarmStatus').textContent = 'Choose a time first. The alarm cannot ring without a deadline.'; return; } try { alarmContext = alarmContext || new (window.AudioContext || window.webkitAudioContext)(); alarmContext.resume(); } catch (error) {} state.alarmAt = alarmDateFromInput(value); state.alarmTriggeredAt = null; state.alarmRinging = false; state.lastAlarmReaction = null; saveState(); ensureTicker(); render(); }
function stopAlarm() { if (!state.alarmAt && !state.alarmRinging) return; if (state.alarmRinging) { const stoppedAt = Date.now(); state.lastAlarmReaction = Math.max(0, Math.floor((stoppedAt - state.alarmTriggeredAt) / 1000)); state.alarmHistory.push({ scheduledAt: state.alarmAt, triggeredAt: state.alarmTriggeredAt, stoppedAt, responseSeconds: state.lastAlarmReaction }); if (state.alarmStartedTimer) { stopTimer(); state.alarmStartedTimer = false; } } state.alarmAt = null; state.alarmTriggeredAt = null; state.alarmRinging = false; clearInterval(alarmToneTimer); alarmToneTimer = null; $('urgencyAlert').classList.remove('show'); saveState(); maybeStopTicker(); render(); }
function resetData() { if (!window.confirm('Reset every session, badge, and alarm?')) return; state = { ...defaultState }; localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_KEY); clearInterval(ticker); ticker = null; clearInterval(alarmToneTimer); alarmToneTimer = null; render(); }

$('startButton').addEventListener('click', startTimer); $('stopButton').addEventListener('click', stopTimer); $('fastMode').addEventListener('change', toggleFastMode); $('setAlarmButton').addEventListener('click', setAlarm); $('stopAlarmButton').addEventListener('click', stopAlarm); $('urgencyToggle').addEventListener('change', event => { state.urgency = event.target.checked; saveState(); render(); }); $('resetButton').addEventListener('click', resetData);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.running && state.urgency) { $('alertTitle').textContent = '!! WARNING: WORK DETECTED !!'; $('alertMessage').textContent = 'Close your productivity tools immediately to save your idle streak!'; $('urgencyAlert').classList.add('show'); window.setTimeout(() => { if (!state.alarmRinging) $('urgencyAlert').classList.remove('show'); }, 7000); } });

checkBadges();
if (state.alarmAt && Date.now() >= state.alarmAt) triggerAlarm();
if (state.running || state.alarmAt) { state.startedAt = state.running ? (state.startedAt || Date.now()) : null; ensureTicker(); }
render();
