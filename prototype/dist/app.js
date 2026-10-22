import { tasks, rewards } from './data.js';
import { illustration } from './illustrations.js';
import { balance, completeTask, redeemReward, isCompleted, initialState, loadState, saveState } from './model.js';

const app = document.querySelector('#app');
const sheet = document.querySelector('#sheet');
const sheetContent = document.querySelector('#sheet-content');
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let state = loadState(storage);
let rewardFilter = 'Todos';
let taskFilter = 'Pendentes';
let toastTimeout;
let sheetOpener;
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const points = n => new Intl.NumberFormat('pt-BR').format(n);
const page = () => ['atividades', 'meus-mimos'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'lojinha';

function taskCard(task) {
  const done = isCompleted(state, task.id);
  return `<article class="task ${done ? 'done' : ''}"><span class="task-icon ${task.color}">${icon(task.icon)}</span><div class="task-copy"><h3>${task.title}</h3><p>${done ? 'Mais um cuidado que virou conquista. ♡' : task.description}</p></div><span class="task-points">${done ? 'ganhou ' : '+'}${task.points}<span class="sr-only"> pontos</span></span><button class="task-check" data-action="complete" data-id="${task.id}" aria-label="${done ? 'Concluída: ' : 'Registrar conquista: '}${task.title}" ${done ? 'disabled' : ''}>${done ? icon('check') : '<span aria-hidden="true">+</span>'}</button></article>`;
}

function rewardCard(reward) {
  const remaining = reward.points - balance(state);
  return `<button class="reward-card" data-action="reward" data-id="${reward.id}" aria-label="Ver mimo: ${reward.title}, ${reward.points} pontos"><div class="reward-art ${reward.color}"><span class="art-tag">${reward.tag}</span>${illustration(reward.art)}<svg class="art-sparkle" aria-hidden="true"><use href="#i-sparkle"/></svg></div><div class="ticket-edge"></div><div class="reward-copy"><h3>${reward.title}</h3><p>${reward.subtitle}</p><div class="reward-price-row"><span class="reward-price">${icon('sparkle')}${reward.points} pts</span><span class="reward-open">${icon('arrow')}</span></div><span class="reward-afford ${remaining > 0 ? 'locked' : ''}">${icon(remaining > 0 ? 'lock' : 'heart')}${remaining > 0 ? `Faltam ${points(remaining)} pontinhos` : 'Já pode ser seu'}</span></div></button>`;
}

function home() {
  return `<div class="greeting"><span class="overline">UMA LOJINHA DO RAFAEL PRA VOCÊ ${icon('heart')}</span><h1>Oi, Júlia. <em>Que bom te ver!</em></h1><p>Suas pequenas conquistas merecem um mimo.</p></div>
  <div class="wallet-wrap"><button class="wallet" data-action="statement" aria-label="Ver extrato, saldo de ${balance(state)} pontos"><span class="wallet-label">${icon('sparkle')} Seu potinho de pontos</span><strong class="balance-number">${points(balance(state))}<small>pontinhos</small></strong><span class="wallet-footer">Um carinho de cada vez ${icon('arrow')}</span></button><span class="wallet-doodle" aria-hidden="true">♡</span><img class="wallet-sticker" src="./assets/mimo-kitten.png" alt="Gatinho com óculos de coração, laço rosa e uma cartinha de amor" width="153" height="174" fetchpriority="high"><div class="wallet-caption">${icon('heart')} conquistados por você, preparados com amor.</div></div>
  <section class="section"><div class="section-heading"><h2>Um pouquinho por você</h2><a class="text-link" href="#atividades">Ver atividades ${icon('arrow')}</a></div><div class="task-list">${tasks.slice(0, 2).map(taskCard).join('')}</div></section>
  <section class="section"><div class="section-kicker">coisas boas te esperando</div><div class="section-heading"><h2>Escolha seu próximo mimo</h2><span aria-hidden="true" style="color:var(--action);font-size:23px">♡</span></div><div class="filters" role="group" aria-label="Filtrar recompensas">${['Todos', 'A dois', 'Pra você', 'Surpresas'].map(f => `<button class="filter-chip ${rewardFilter === f ? 'active' : ''}" data-action="filter-rewards" data-filter="${f}" aria-pressed="${rewardFilter === f}">${f}</button>`).join('')}</div><div class="reward-grid">${rewards.filter(r => rewardFilter === 'Todos' || r.category === rewardFilter).map(rewardCard).join('')}</div></section>
  <button class="love-note" data-action="note" style="width:calc(100% - 44px);text-align:left">${icon('heart')}<div><p>“Torço por você. Todos os dias.”</p><span>um bilhetinho do Rafael · toque para ler</span></div></button>`;
}

function activities() {
  const done = tasks.filter(t => isCompleted(state, t.id));
  const completedPoints = done.reduce((total, t) => total + t.points, 0);
  const filtered = tasks.filter(t => taskFilter === 'Concluídas' ? isCompleted(state, t.id) : !isCompleted(state, t.id));
  return `<div class="page-title"><span class="eyebrow">UM PASSINHO DE CADA VEZ</span><h1>Seu bem também é meu.</h1><p>Cuide de você, celebre as conquistas<br>e junte pontinhos pelo caminho.</p></div><div class="activity-progress"><div class="activity-progress-top"><strong>Seu carinho de hoje</strong><span>${done.length} de ${tasks.length}</span></div><div class="progress-track" role="progressbar" aria-label="Atividades concluídas hoje" aria-valuenow="${done.length}" aria-valuemin="0" aria-valuemax="${tasks.length}"><span style="width:${done.length / tasks.length * 100}%"></span></div><p>${done.length === tasks.length ? 'Você reservou um tempinho pra você. Que orgulho! ♡' : 'Sem pressa, sem cobrança. Cada passinho conta.'}</p></div><div class="section"><div class="section-heading"><h2>Suas atividades</h2><span class="eyebrow" style="letter-spacing:0;font-size:10px">+${completedPoints} pts hoje</span></div><div class="filters" role="group" aria-label="Filtrar atividades">${['Pendentes', 'Concluídas'].map(f => `<button class="filter-chip ${taskFilter === f ? 'active' : ''}" data-action="filter-tasks" data-filter="${f}" aria-pressed="${taskFilter === f}">${f}</button>`).join('')}</div><div class="task-list">${filtered.length ? filtered.map(taskCard).join('') : `<div class="empty-state">${icon(taskFilter === 'Concluídas' ? 'sparkle' : 'heart')}<h3>${taskFilter === 'Concluídas' ? 'Seu primeiro passinho te espera.' : 'Por hoje, só carinho.'}</h3><p>${taskFilter === 'Concluídas' ? 'Quando registrar uma conquista, ela aparece aqui.' : 'Você concluiu as atividades de hoje. Amanhã tem mais um pouquinho por você.'}</p></div>`}</div><p class="small-note">Cada atividade pode render pontos uma vez por dia.<br>As conquistas se renovam a cada novo dia.</p></div><button class="page-wallet" data-action="statement" style="width:calc(100% - 44px)"><span>Seu potinho de pontos</span><strong>${icon('sparkle')}${points(balance(state))} pts</strong></button>`;
}

function redemptionCard(item) {
  const date = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(item.date));
  return `<article class="redeemed-ticket"><div class="redeemed-top">${icon('ticket')}<div><h3>${item.title}</h3><p>Resgatado em ${date} · ${item.points} pontinhos</p></div></div><div class="redeemed-bottom"><span class="status-label">${icon('heart')}Carinho reservado</span><span class="redeemed-code">MIMO-${item.id.slice(0, 6).toUpperCase()}</span></div></article>`;
}

function myRewards() {
  return `<div class="page-title"><span class="eyebrow">ESCOLHIDOS POR VOCÊ</span><h1>Seus carinhos reservados.</h1><p>Os mimos que já têm seu nome<br>e um pouquinho de amor guardado.</p></div><div class="mini-stat-row"><div class="mini-stat"><strong>${state.redemptions.length}</strong><span>mimos resgatados</span></div><div class="mini-stat"><strong>${points(balance(state))}</strong><span>pontinhos para sonhar</span></div></div><section class="section"><div class="section-heading"><h2>Meus mimos</h2></div>${state.redemptions.length ? `${state.redemptions.map(redemptionCard).join('')}<p class="small-note">Agora é só combinar com o Rafael<br>o melhor momento de aproveitar. ♡</p><a class="button-secondary" href="#lojinha">Escolher outro carinho ${icon('arrow')}</a>` : `<div class="empty-state">${icon('gift')}<h3>Tem um carinho<br>esperando por você.</h3><p>Escolha seu primeiro mimo na lojinha.<br>Ele vai ganhar um lugar especial aqui.</p><a class="button-primary" href="#lojinha">Explorar a lojinha ${icon('arrow')}</a></div>`}</section>`;
}

function render() {
  const current = page();
  app.innerHTML = current === 'atividades' ? activities() : current === 'meus-mimos' ? myRewards() : home();
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.classList.toggle('active', link.dataset.nav === current);
    if (link.dataset.nav === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const badge = document.querySelector('#redeemed-count');
  badge.hidden = state.redemptions.length === 0;
  badge.textContent = state.redemptions.length;
}

function preserveFocus(callback) {
  const el = document.activeElement;
  const action = el?.dataset.action;
  const filter = el?.dataset.filter;
  const id = el?.dataset.id;
  callback();
  if (action) {
    const selector = `[data-action="${action}"]${filter ? `[data-filter="${filter}"]` : ''}${id ? `[data-id="${id}"]` : ''}`;
    const replacement = document.querySelector(selector);
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
  }
}

function openSheet(html, opener = document.activeElement) {
  sheetOpener = opener;
  sheetContent.innerHTML = html;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}

function closeSheet() {
  sheet.close();
}

function showReward(id) {
  const reward = rewards.find(r => r.id === id);
  if (!reward) return;
  const missing = reward.points - balance(state);
  openSheet(`<div class="sheet-art ${reward.color}"><span class="art-tag">${reward.tag}</span>${illustration(reward.art)}</div><p class="sheet-overline">UM CARINHO DO RAFAEL</p><h2 class="sheet-title" id="sheet-title">${reward.title}</h2><p class="sheet-description">${reward.description}</p><div class="sheet-note">“${reward.note}”</div><div class="sheet-balance"><span>Seu saldo <strong>${points(balance(state))} pts</strong></span><span>Este mimo <strong>${reward.points} pts</strong></span></div>${missing > 0 ? `<div class="sheet-missing">Faltam <strong>${missing} pontinhos</strong> para esse carinho. Cada pequena conquista te deixa mais pertinho.</div><button class="button-primary" data-action="go-activities">Conquistar mais pontinhos ${icon('arrow')}</button>` : `<button class="button-primary" data-action="redeem" data-id="${reward.id}">${icon('gift')}Resgatar por ${reward.points} pontinhos</button><p class="small-note">Depois do resgate, combine com o Rafael<br>quando aproveitar seu mimo.</p>`}`);
}

function showStatement() {
  openSheet(`<p class="sheet-overline" style="margin-top:16px">UM CARINHO DE CADA VEZ</p><h2 class="sheet-title" id="sheet-title">Seu potinho de pontos</h2><div class="sheet-wallet-number">${points(balance(state))}<small> pontinhos</small></div><p class="sheet-description">Cada conquista guarda um pouquinho de cuidado.</p><div class="transaction-list">${[...state.transactions].reverse().map(t => `<div class="transaction">${icon(t.points > 0 ? 'sparkle' : 'gift')}<div><h3>${t.title}</h3><p>${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t.date))}</p></div><strong class="${t.points < 0 ? 'negative' : ''}">${t.points > 0 ? '+' : '−'}${points(Math.abs(t.points))} pts</strong></div>`).join('')}</div>`);
}

function notify(message) {
  const toast = document.querySelector('#toast');
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 3300);
}

function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const confetti = document.querySelector('#confetti');
  confetti.innerHTML = Array.from({ length: 17 }, (_, i) => `<span style="left:${8 + i * 5}%;font-size:${15 + i % 4 * 5}px;animation-delay:${i % 5 * .08}s;animation-duration:${2 + i % 3 * .4}s">${i % 3 ? '♡' : '✧'}</span>`).join('');
  setTimeout(() => { confetti.innerHTML = ''; }, 3400);
}

function persist() {
  saveState(storage, state);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, id, filter } = button.dataset;
  if (action === 'complete') {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const result = completeTask(state, task);
    if (result.error) return;
    state = result.state;
    persist();
    const scrollTop = document.querySelector('#app-scroll').scrollTop;
    const windowY = window.scrollY;
    render();
    document.querySelector('#app-scroll').scrollTop = scrollTop;
    window.scrollTo({ top: windowY, behavior: 'instant' });
    const completed = app.querySelector(`[data-id="${id}"]`);
    if (completed) { completed.closest('.task').tabIndex = -1; completed.closest('.task').focus({ preventScroll: true }); }
    else app.focus({ preventScroll: true });
    notify(`+${task.points} pontinhos. Um passinho por você! ♡`);
    celebrate();
  }
  if (action === 'reward') showReward(id);
  if (action === 'statement') showStatement();
  if (action === 'filter-rewards') { rewardFilter = filter; preserveFocus(render); }
  if (action === 'filter-tasks') { taskFilter = filter; preserveFocus(render); }
  if (action === 'close-dialog') closeSheet();
  if (action === 'go-activities') { closeSheet(); location.hash = 'atividades'; }
  if (action === 'redeem') {
    const reward = rewards.find(r => r.id === id);
    if (!reward) return;
    const result = redeemReward(state, reward);
    if (result.error) { showReward(id); return; }
    state = result.state;
    persist();
    render();
    openSheet(`<div class="centered"><div class="success-medallion">${icon('gift')}</div><p class="sheet-overline">ESSE CARINHO AGORA É SEU</p><h2 class="sheet-title success-title" id="sheet-title">Um mimo com seu nome. ♡</h2><p class="sheet-description">Escolhido por você. Preparado com amor.</p><div class="success-ticket"><h3>${reward.title}</h3><p>Seu carinho está reservado.<br>Agora é só combinar com o Rafael.</p><span class="redeemed-code">MIMO-${result.redemption.id.slice(0, 6).toUpperCase()}</span></div><button class="button-primary" data-action="go-redemptions">Ver meus mimos ${icon('arrow')}</button><p class="small-note">Seu novo saldo: ${points(balance(state))} pontinhos</p></div>`, null);
    celebrate();
  }
  if (action === 'go-redemptions') { closeSheet(); location.hash = 'meus-mimos'; }
  if (action === 'note') {
    document.querySelector('.unread-dot')?.setAttribute('hidden', '');
    openSheet(`<div class="note-heading">${icon('heart')}<p class="sheet-overline">UM BILHETINHO PRA VOCÊ</p><h2 class="sheet-title success-title" id="sheet-title">Oi, meu amor.</h2></div><div class="personal-note">Fiz esse cantinho pra te lembrar que eu vejo seu esforço, celebro suas conquistas e adoro cuidar de você.<br><br>Cada mimo é só uma desculpa pra gente criar mais um momento bom juntos.</div><p class="note-sign">Com amor, Rafael ♡</p><button class="button-primary" data-action="close-dialog">Guardar esse carinho ${icon('heart')}</button>`);
  }
  if (action === 'profile') {
    openSheet(`<div class="note-heading"><span class="avatar" style="display:grid;place-items:center;margin:10px auto 18px;width:58px;height:58px;font-size:29px">J</span><p class="sheet-overline">UM CANTINHO SÓ SEU</p><h2 class="sheet-title success-title" id="sheet-title">A lojinha da Júlia</h2></div><p class="sheet-description centered">Preparada com amor pelo Rafael.<br>Atividades para cuidar de você e mimos<br>para criar mais momentos juntos.</p><div class="sheet-note centered">“Torço por você. Todos os dias.”</div><p class="small-note">Esta é uma lojinha de demonstração.<br>Suas escolhas ficam salvas neste navegador.</p><button class="button-secondary" data-action="reset-prompt">Recomeçar demonstração</button>`);
  }
  if (action === 'reset-prompt') {
    openSheet(`<div class="success-medallion">${icon('sparkle')}</div><h2 class="sheet-title centered success-title" id="sheet-title">Um novo comecinho?</h2><p class="sheet-description centered">A demonstração volta aos 240 pontinhos iniciais. As atividades e os mimos resgatados neste navegador serão reiniciados.</p><div class="sheet-button-stack"><button class="button-primary" data-action="reset">Recomeçar demonstração</button><button class="button-secondary" data-action="close-dialog">Continuar de onde parei</button></div>`);
  }
  if (action === 'reset') {
    state = initialState(); rewardFilter = 'Todos'; taskFilter = 'Pendentes'; persist(); closeSheet();
    if (page() !== 'lojinha') location.hash = 'lojinha'; else render();
    notify('Tudo prontinho para um novo começo. ♡');
  }
});

sheet.addEventListener('click', event => { if (event.target === sheet) { const rect = sheet.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSheet(); } });
sheet.addEventListener('close', () => { if (sheetOpener?.isConnected) sheetOpener.focus({ preventScroll: true }); });
window.addEventListener('hashchange', () => { render(); document.querySelector('#app-scroll').scrollTop = 0; window.scrollTo({ top: 0, behavior: 'instant' }); app.focus({ preventScroll: true }); });
render();
