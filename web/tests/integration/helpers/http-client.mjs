import assert from 'node:assert/strict';

export class BrowserSession {
  constructor(environment) {
    this.environment = environment;
    this.cookies = new Map();
  }

  clone() {
    const client = new BrowserSession(this.environment);
    client.cookies = new Map(this.cookies);
    return client;
  }

  async request(path, { method = 'GET', json, body, headers = {} } = {}) {
    const url = new URL(path, this.environment.origin);
    assert.ok([this.environment.origin, this.environment.supabaseURL].includes(url.origin),
      'O cliente de teste não envia cookies para outra origem.');
    const requestHeaders = new Headers();
    if (this.cookies.size) {
      requestHeaders.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    if (!['GET', 'HEAD'].includes(method)) requestHeaders.set('Origin', this.environment.origin);
    if (json !== undefined) requestHeaders.set('Content-Type', 'application/json');
    for (const [name, value] of Object.entries(headers)) requestHeaders.set(name, value);
    const response = await fetch(url, {
      method, headers: requestHeaders, redirect: 'manual',
      body: json === undefined ? body : JSON.stringify(json), signal: AbortSignal.timeout(15_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);
      const maxAge = attributes.find(attribute => /^\s*max-age=/i.test(attribute));
      const expires = attributes.find(attribute => /^\s*expires=/i.test(attribute));
      const expired = maxAge ? Number(maxAge.split('=')[1]) <= 0 :
        expires ? Date.parse(expires.slice(expires.indexOf('=') + 1)) <= Date.now() : false;
      if (expired || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  get(path, headers) { return this.request(path, { headers }); }
  post(path, json, headers) { return this.request(path, { method: 'POST', json, headers }); }
  patch(path, json, headers) { return this.request(path, { method: 'PATCH', json, headers }); }

  async followConfirmation(link) {
    let next = new URL(link);
    for (let hop = 0; hop < 8; hop += 1) {
      const response = await this.request(next.href);
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      assert.ok(location, 'A confirmação deve informar o destino do redirecionamento.');
      next = new URL(location, next);
    }
    throw new Error('A confirmação excedeu o limite de redirecionamentos locais.');
  }

  storedSession() {
    const chunks = [...this.cookies].filter(([name]) => /^meumimo-auth(?:\.\d+)?$/.test(name))
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
    assert.ok(chunks.length, 'O login deve devolver o cookie da sessão.');
    const raw = decodeURIComponent(chunks.map(([, value]) => value).join(''));
    assert.ok(raw.startsWith('base64-'), 'Formato inesperado do cookie SSR.');
    return JSON.parse(Buffer.from(raw.slice(7), 'base64url').toString('utf8'));
  }

  replaceStoredSession(session) {
    for (const name of this.cookies.keys()) {
      if (/^meumimo-auth(?:\.\d+)?$/.test(name)) this.cookies.delete(name);
    }
    this.cookies.set('meumimo-auth', `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`);
  }
}

export function expectStatus(response, status) {
  assert.equal(response.status, status, `A API deveria responder ${status}, recebeu ${response.status}.`);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
}

export async function errorCode(response, status, code) {
  expectStatus(response, status);
  const body = await response.json();
  if (code) assert.equal(body.code, code);
  return body;
}
