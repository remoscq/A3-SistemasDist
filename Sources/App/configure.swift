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

struct IndicatorsMethodMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        if request.url.path == "/api/indicadores" && request.method != .GET {
            let response = try jsonError(.methodNotAllowed, "Método não permitido.")
            response.headers.replaceOrAdd(name: .allow, value: "GET")
            return response
        }
        return try await next.respond(to: request)
    }
}

func configure(_ app: Application, service: IndicatorsService? = nil) throws {
    let indicators: IndicatorsService
    if let service {
        indicators = service
    } else {
        // O cliente pertence à aplicação e é encerrado pelo ciclo de vida do Vapor.
        let client = app.client
        indicators = IndicatorsService(load: { try await fetchIBGEVariables(using: client) })
    }
    app.middleware.use(SecurityMiddleware(), at: .beginning)
    app.middleware.use(IndicatorsMethodMiddleware())
    app.middleware.use(FileMiddleware(publicDirectory: app.directory.workingDirectory + "public/", defaultFile: "index.html"))

    app.get("health") { _ in ["status": "ok", "provider": "swift"] }
    app.get("api", "indicadores") { request async throws -> Response in
        do {
            let payload = try await indicators.indicators()
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
}
