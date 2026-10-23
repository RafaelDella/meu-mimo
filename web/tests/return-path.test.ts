import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnPath } from '../src/server/auth/return-path.ts';

test('retorno de autenticação preserva apenas caminhos internos permitidos', () => {
  for (const value of [
    '/conta', '/conta/seguranca', '/conta/', '/convites/convite-123',
    '/lojas/loja-123/mimos?ordem=recentes#catalogo',
    '/convites/convite_123?origem=email', '/conta?nome=Ana%20Maria',
    '/admin', '/admin/contas/11111111-1111-4111-8111-111111111111',
  ]) assert.equal(safeReturnPath(value), value);
});

test('retorno rejeita origem externa, controles e rotas fora da lista', () => {
  for (const value of [
    null, '', ' /lojas', 'conta', 'https://example.org/conta',
    '//example.org/conta', '///example.org', 'javascript:alert(1)',
    '/\\example.org', '/conta\\seguranca', '/conta\n', '/conta\t',
    '/administracao', '/contabilidade', '/api/auth/callback', '/lojas//outra',
    '/convites/../admin', '/lojas/./outra', '/conta;externo',
    `/lojas/${'a'.repeat(2048)}`,
  ]) assert.equal(safeReturnPath(value), '/conta', String(value));
});

test('retorno rejeita caminhos codificados e codificações ambíguas de query', () => {
  for (const value of [
    '/%2fexample.org', '/%252fexample.org', '/conta/%2e%2e/admin',
    '/lojas/%5coutro', '/lojas/%255coutro', '/lojas/%00',
    '/conta?x=%0d%0aLocation:evil', '/conta?x=%250a',
    '/conta?x=%5c', '/conta?x=%255c', '/conta?x=%ZZ',
    '/conta#%0a', '/conta?x=%25252525250a',
  ]) assert.equal(safeReturnPath(value), '/conta', value);
});
