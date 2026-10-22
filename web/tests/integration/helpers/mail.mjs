import assert from 'node:assert/strict';

export async function confirmationLink(environment, email) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${environment.mailURL}/api/v1/messages`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, 'A integração de e-mail exige o Mailpit local.');
    const list = await response.json();
    const message = (list.messages ?? []).find(item =>
      (item.To ?? []).some(recipient => recipient.Address?.toLowerCase() === email.toLowerCase()));
    if (message) {
      const content = await fetch(`${environment.mailURL}/api/v1/message/${encodeURIComponent(message.ID)}`,
        { signal: AbortSignal.timeout(5000) });
      assert.equal(content.status, 200);
      const mail = await content.json();
      const source = `${mail.Text ?? ''}\n${mail.HTML ?? ''}`.replaceAll('&amp;', '&');
      const links = [...source.matchAll(/https?:\/\/[^\s<>"']+/g)].map(match => match[0]);
      const link = links.find(value => {
        const url = new URL(value);
        return url.origin === environment.supabaseURL && url.pathname === '/auth/v1/verify';
      });
      assert.ok(link, 'O e-mail deve conter a confirmação do Auth local.');
      return link;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('O e-mail de confirmação não chegou ao Mailpit local.');
}
