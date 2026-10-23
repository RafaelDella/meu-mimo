import { createHmac, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Pool } from 'pg';
import type { Person } from './helpers';

type MailEnvironment = { mailURL: string; supabaseURL: string; origin: string };
type MailSummary = { ID: string; To?: { Address?: string }[] };

/** Mailpit é lido somente pelo processo Node; o link continua pelo Auth real. */
export async function localMailLink(environment: MailEnvironment, email: string, purpose: 'signup' | 'recovery') {
  let found: string | undefined;
  await expect.poll(async () => {
    const response = await fetch(`${environment.mailURL}/api/v1/messages`, { signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(200);
    const mailbox = await response.json() as { messages?: MailSummary[] };
    for (const message of mailbox.messages ?? []) {
      if (!message.To?.some(recipient => recipient.Address?.toLowerCase() === email.toLowerCase())) continue;
      const content = await fetch(`${environment.mailURL}/api/v1/message/${encodeURIComponent(message.ID)}`,
        { signal: AbortSignal.timeout(5000) });
      expect(content.status).toBe(200);
      const mail = await content.json() as { Text?: string; HTML?: string };
      const source = `${mail.Text ?? ''}\n${mail.HTML ?? ''}`.replace(/&amp;/g, '&');
      for (const match of source.matchAll(/https?:\/\/[^\s<>"']+/g)) {
        const url = new URL(match[0]); const redirect = url.searchParams.get('redirect_to');
        if (url.origin !== environment.supabaseURL || url.pathname !== '/auth/v1/verify' ||
            url.searchParams.get('type') !== purpose || !redirect) continue;
        const destination = new URL(redirect);
        expect(destination.origin).toBe(environment.origin);
        expect(destination.pathname).toBe('/api/auth/callback');
        found = url.href; return true;
      }
    }
    return false;
  }, { timeout: 25_000, intervals: [250, 500, 1000], message: 'O Mailpit deve entregar o fluxo local solicitado.' }).toBe(true);
  if (!found) throw new Error('Link local ausente.');
  return found;
}

export async function logout(page: Page) {
  await page.goto('/conta');
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByText('Você saiu da sua conta.', { exact: true })).toBeVisible();
}

export async function provisionAdmin(page: Page, database: Pool, person: Person, trackRateKey: (key: string) => void) {
  const rateSecret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!rateSecret) throw new Error('O harness não forneceu o contexto operacional da fixture.');
  for (const kind of ['read', 'write']) trackRateKey(createHmac('sha256', rateSecret).update('meumimo:t13:admin-rate:v1\0')
    .update(kind).update('\0').update(person.id).digest('hex'));
  // A concessão operacional é a única preparação privilegiada; MFA usa a UI.
  await database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [person.id]);
  await page.goto('/conta');
  await page.getByRole('button', { name: 'Configurar aplicativo autenticador', exact: true }).click();
  const secret = await page.getByLabel('Chave para configuração manual', { exact: true }).inputValue();
  expect(secret).not.toBe('');
  const totpHelper = await import(new URL('../integration/helpers/totp.mjs', import.meta.url).href);
  await page.getByLabel('Código do aplicativo autenticador', { exact: true }).fill(totpHelper.totp(secret));
  await page.getByRole('button', { name: 'Confirmar código', exact: true }).click();
  await expect(page.getByText('Verificação em duas etapas confirmada', { exact: true })).toBeVisible();
  const session = await page.request.get('/api/admin/session'); expect(session.status()).toBe(200);
}

export function syntheticAccount() {
  return { email: `t14-browser-${randomUUID()}@example.test`, password: `Cadastro!${randomUUID()}` };
}

export async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

/** read/write são as quantidades mínimas restantes, sem alterar as cotas do produto. */
export async function waitForDomainBudget(database: Pool, profileId: string,
  { read = 35, write = 15 }: { read?: number; write?: number } = {}) {
  if (!Number.isInteger(read) || read < 0 || read > 120 || !Number.isInteger(write) || write < 0 || write > 30) {
    throw new Error('Orçamento de fixture fora dos limites locais.');
  }
  const secret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!secret) throw new Error('O harness não forneceu o contexto operacional da fixture.');
  const key = (kind: string) => createHmac('sha256', secret).update('meumimo:t04:domain-rate:v1\0')
    .update(kind).update('\0').update(profileId).digest('hex');
  const readKey = key('read'); const writeKey = key('write');
  await expect.poll(async () => {
    const result = await database.query<{ key: string; used: number }>(`SELECT b.key,
      (SELECT count(*)::int FROM unnest(b.attempts) AS counted(attempt)
        WHERE counted.attempt>clock_timestamp()-interval '60 seconds') AS used
      FROM app."AuthRateBucket" b WHERE b.key=ANY($1::text[])`, [[readKey, writeKey]]);
    const usage = new Map(result.rows.map(row => [row.key, row.used]));
    return 120 - (usage.get(readKey) ?? 0) >= read && 30 - (usage.get(writeKey) ?? 0) >= write;
  }, { timeout: 65_000, intervals: [1000], message: 'Aguardar a janela real de leitura/escrita da própria fixture.' }).toBe(true);
}
