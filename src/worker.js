import { fetchSwiftIndicators, fetchSwiftGuanambi } from '../lib/swift.js';
import { SECURITY_HEADERS } from '../lib/headers.js';

/** Rotas da API encaminhadas ao servidor Vapor. */
const ROUTES = {
  '/api/indicadores': fetchSwiftIndicators,
  '/api/guanambi': fetchSwiftGuanambi
};

export function createWorker(fetcher = fetch) {
  async function proxy(request, env, fetchSwift) {
    const headers = { 'Cache-Control': 'no-store' };
    if (request.method !== 'GET') {
      return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    }
    if (!env.VAPOR_API_ORIGIN) {
      return Response.json({ error: 'O servidor da API Swift ainda não foi configurado.' }, { status: 503, headers });
    }
    try {
      return Response.json(await fetchSwift(env.VAPOR_API_ORIGIN, fetcher), { headers });
    } catch (error) {
      return Response.json({ error: 'A API Swift está indisponível. Aguarde um momento e tente novamente.' }, {
        status: error.name === 'TimeoutError' || error.status === 504 ? 504 : 502, headers
      });
    }
  }
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      const route = Object.hasOwn(ROUTES, pathname) ? ROUTES[pathname] : null;
      const response = route
        ? await proxy(request, env, route)
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
