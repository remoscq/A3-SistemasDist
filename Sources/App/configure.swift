import Foundation
import IBGECore
import Vapor

private struct APIError: Content { let error: String }

private func jsonError(_ status: HTTPResponseStatus, _ message: String) throws -> Response {
    let response = Response(status: status)
    try response.content.encode(APIError(error: message))
    response.headers.replaceOrAdd(name: .cacheControl, value: "no-store")
    return response
}

struct SecurityMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        // Executa antes do ErrorMiddleware para incluir cabeçalhos nas respostas de erro.
        let response = try await next.respond(to: request)
        response.headers.replaceOrAdd(name: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'")
        response.headers.replaceOrAdd(name: "X-Content-Type-Options", value: "nosniff")
        response.headers.replaceOrAdd(name: "Referrer-Policy", value: "strict-origin-when-cross-origin")
        return response
    }
}

/// Rotas da API que aceitam somente GET; outros métodos recebem 405 com `Allow: GET`.
let apiRoutes: Set<String> = ["/api/indicadores", "/api/guanambi"]

struct APIMethodMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        if apiRoutes.contains(request.url.path) && request.method != .GET {
            let response = try jsonError(.methodNotAllowed, "Método não permitido.")
            response.headers.replaceOrAdd(name: .allow, value: "GET")
            return response
        }
        return try await next.respond(to: request)
    }
}

/// Executa a consulta e converte o resultado em JSON; falhas viram 502 ou, em timeout, 504.
private func apiResponse<T: Encodable>(_ request: Request, _ load: () async throws -> T) async throws -> Response {
    do {
        let payload = try await load()
        let response = Response(status: .ok)
        response.headers.contentType = .json
        response.headers.replaceOrAdd(name: .cacheControl, value: "no-store")
        response.body = .init(data: try JSONEncoder().encode(payload))
        return response
    } catch {
        request.logger.warning("Falha na consulta ao IBGE: \(error)")
        let timeout = (error as? IBGEError) == .timeout
        return try jsonError(timeout ? .gatewayTimeout : .badGateway,
            "O serviço do IBGE está indisponível ou retornou uma resposta inesperada. Aguarde um momento e tente novamente.")
    }
}

func configure(_ app: Application, service: IndicatorsService? = nil, guanambi: GuanambiService? = nil) throws {
    // O cliente pertence à aplicação e é encerrado pelo ciclo de vida do Vapor.
    let client = app.client
    let indicators = service ?? IndicatorsService(load: { try await fetchIBGEVariables(using: client) })
    let guanambi = guanambi ?? GuanambiService(load: { try await fetchGuanambiSources(using: client) })

    app.middleware.use(SecurityMiddleware(), at: .beginning)
    app.middleware.use(APIMethodMiddleware())
    app.middleware.use(FileMiddleware(publicDirectory: app.directory.workingDirectory + "public/", defaultFile: "index.html"))

    app.get("health") { _ in ["status": "ok", "provider": "swift"] }
    app.get("api", "indicadores") { request async throws -> Response in
        try await apiResponse(request) { try await indicators.indicators() }
    }
    app.get("api", "guanambi") { request async throws -> Response in
        try await apiResponse(request) { try await guanambi.data() }
    }
}
