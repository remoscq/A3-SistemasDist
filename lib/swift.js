import { normalizeVariables } from '../public/data.js';

export async function fetchSwiftIndicators(origin, fetcher = fetch) {
  const base = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) ||
      base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Configure VAPOR_API_ORIGIN com a origem HTTPS do servidor Vapor.');
  }
  const response = await fetcher(new URL('/api/indicadores', base).href, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
    redirect: 'error'
  });
  if (!response.ok) {
    const error = new Error('A API Swift está indisponível.');
    error.status = response.status === 504 ? 504 : 502;
    throw error;
  }
  const payload = await response.json();
  normalizeVariables(payload.variables);
  if (payload.provider !== 'swift' || !Number.isFinite(Date.parse(payload.fetchedAt)) ||
      typeof payload.sourceUrl !== 'string') throw new Error('Resposta inválida da API Swift.');
  return payload;
}
