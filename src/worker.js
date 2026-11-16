import { fetchSwiftIndicators } from '../lib/swift.js';
import { SECURITY_HEADERS } from '../lib/headers.js';

export function createWorker(fetcher = fetch) {
  async function indicators(request, env) {
    const headers = { 'Cache-Control': 'no-store' };
    if (request.method !== 'GET') {
      return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    }
    if (!env.VAPOR_API_ORIGIN) {
      return Response.json({ error: 'O servidor da API Swift ainda não foi configurado.' }, { status: 503, headers });
    }
    try {
      return Response.json(await fetchSwiftIndicators(env.VAPOR_API_ORIGIN, fetcher), { headers });
    } catch (error) {
      return Response.json({ error: 'A API Swift está indisponível. Aguarde um momento e tente novamente.' }, {
        status: error.name === 'TimeoutError' || error.status === 504 ? 504 : 502, headers
      });
    }
  }
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      const response = pathname === '/api/indicadores'
        ? await indicators(request, env)
        : pathname.startsWith('/api/') || pathname === '/api'
          ? new Response('Página não encontrada.', { status: 404 })
          : await env.ASSETS.fetch(request);
      const secured = new Response(response.body, response);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        secured.headers.set(name, value);
      }
      return secured;
    }
  };
}

export default createWorker();
