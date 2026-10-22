export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function initialState() {
  return { version: 1, completed: [], redemptions: [], transactions: [{ id: 'welcome', title: 'Um incentivo pra começar', points: 240, date: new Date().toISOString() }] };
}

export function balance(state) {
  return state.transactions.reduce((total, item) => total + item.points, 0);
}

export function isCompleted(state, id, day = today()) {
  return state.completed.some(item => item.id === id && item.day === day);
}

export function completeTask(state, task, day = today()) {
  if (isCompleted(state, task.id, day)) return { state, error: 'already-completed' };
  const now = new Date().toISOString();
  return { state: { ...state, completed: [...state.completed, { id: task.id, day }], transactions: [...state.transactions, { id: `task-${task.id}-${day}`, title: task.title, points: task.points, date: now }] } };
}

export function redeemReward(state, reward) {
  if (balance(state) < reward.points) return { state, error: 'insufficient-points' };
  const id = crypto.randomUUID();
  const date = new Date().toISOString();
  const redemption = { id, rewardId: reward.id, title: reward.title, points: reward.points, date };
  return { state: { ...state, redemptions: [redemption, ...state.redemptions], transactions: [...state.transactions, { id, title: reward.title, points: -reward.points, date }] }, redemption };
}

export function loadState(storage) {
  try {
    const value = JSON.parse(storage.getItem('meu-mimo-v1'));
    if (value?.version === 1 && Array.isArray(value.completed) && Array.isArray(value.redemptions) && Array.isArray(value.transactions) && value.transactions.length && value.transactions.every(t => Number.isFinite(t.points) && typeof t.title === 'string') && balance(value) >= 0) return value;
  } catch { /* A prévia continua funcionando quando o armazenamento não está disponível. */ }
  return initialState();
}

export function saveState(storage, state) {
  try { storage.setItem('meu-mimo-v1', JSON.stringify(state)); return true; } catch { return false; }
}
