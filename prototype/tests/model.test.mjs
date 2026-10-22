import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, balance, completeTask, redeemReward, loadState, saveState } from '../dist/model.js';
import { tasks, rewards } from '../dist/data.js';

test('uma conquista soma pontos apenas uma vez no mesmo dia', () => {
  const first = completeTask(initialState(), tasks[0], '2026-10-21');
  assert.equal(balance(first.state), 270);
  const second = completeTask(first.state, tasks[0], '2026-10-21');
  assert.equal(second.error, 'already-completed');
  assert.equal(balance(second.state), 270);
  assert.equal(second.state.completed.length, 1);
});
test('a atividade pode ser concluída novamente em outro dia', () => {
  const first = completeTask(initialState(), tasks[0], '2026-10-21');
  const next = completeTask(first.state, tasks[0], '2026-10-22');
  assert.equal(balance(next.state), 300);
  assert.equal(next.state.completed.length, 2);
});
test('resgatar registra um ticket e uma única saída no extrato', () => {
  const result = redeemReward(initialState(), rewards[0]);
  assert.equal(balance(result.state), 120);
  assert.equal(result.state.redemptions.length, 1);
  assert.equal(result.state.transactions.length, 2);
  assert.equal(result.redemption.rewardId, 'breakfast');
});
test('saldo insuficiente impede o resgate e preserva o estado', () => {
  const original = initialState();
  const result = redeemReward(original, rewards[1]);
  assert.equal(result.error, 'insufficient-points');
  assert.equal(result.state, original);
  assert.equal(balance(result.state), 240);
});
test('um resgate pode consumir exatamente o saldo disponível', () => {
  const first = redeemReward(initialState(), rewards[0]);
  const second = redeemReward(first.state, rewards[0]);
  assert.equal(balance(second.state), 0);
  const third = redeemReward(second.state, rewards[0]);
  assert.equal(third.error, 'insufficient-points');
  assert.equal(third.state.redemptions.length, 2);
});
test('as conquistas e os tickets sobrevivem ao recarregamento', () => {
  const memory = new Map();
  const storage = { getItem: k => memory.get(k), setItem: (k,v) => memory.set(k,v) };
  const earned = completeTask(initialState(), tasks[1], '2026-10-21');
  const redeemed = redeemReward(earned.state, rewards[0]);
  assert.equal(saveState(storage, redeemed.state), true);
  assert.deepEqual(loadState(storage), redeemed.state);
});
test('armazenamento indisponível ou inválido não impede a demonstração', () => {
  assert.equal(balance(loadState(null)), 240);
  assert.equal(balance(loadState({ getItem: () => '{broken' })), 240);
  assert.equal(saveState(null, initialState()), false);
  assert.equal(balance(loadState({ getItem: () => JSON.stringify({ version: 1, transactions: [{ points: -5, title: 'corrompido' }], completed: [], redemptions: [] }) })), 240);
});
