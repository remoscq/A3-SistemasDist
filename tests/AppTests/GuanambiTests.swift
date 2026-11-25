@testable import App
import Foundation
import IBGECore
import Testing
import VaporTesting

private let censoEscolarBody = #"[{"id":5908,"res":[{"localidade":"291170","res":{"2024":"11552","2025":"11515","2010":"-","2008":null},"notas":{"2024":null}}]}]"#
private let alfabetizacaoBody = #"[{"id":"2513","variavel":"Taxa de alfabetização","unidade":"%","resultados":[{"classificacoes":[{"id":"2","nome":"Sexo","categoria":{"6794":"Total"}},{"id":"86","nome":"Cor ou raça","categoria":{"95251":"Total"}},{"id":"287","nome":"Idade","categoria":{"100362":"Total"}}],"series":[{"localidade":{"id":"2911709","nome":"Guanambi (BA)"},"serie":{"2022":"88.16"}},{"localidade":{"id":"29","nome":"Bahia"},"serie":{"2022":"87.40"}}]}]}]"#
private let frequenciaBody = #"[{"id":"3795","variavel":"Taxa de frequência escolar bruta","unidade":"%","resultados":[{"classificacoes":[{"id":"58","nome":"Grupo de idade","categoria":{"31615":"6 a 14 anos"}},{"id":"2","nome":"Sexo","categoria":{"6794":"Total"}},{"id":"86","nome":"Cor ou raça","categoria":{"95251":"Total"}}],"series":[{"localidade":{"id":"2911709","nome":"Guanambi (BA)"},"serie":{"2022":"98.93"}}]}]}]"#

private func decode<T: Decodable>(_ type: T.Type, _ body: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(body.utf8))
}

private func validSources() throws -> GuanambiSources {
    GuanambiSources(
        censoEscolar: try decode([IBGECidadesIndicator].self, censoEscolarBody),
        alfabetizacao: try decode([IBGEVariable].self, alfabetizacaoBody),
        frequenciaEscolar: try decode([IBGEVariable].self, frequenciaBody)
    )
}

private struct StubClient: Client {
    let eventLoop: any EventLoop
    let respond: @Sendable (ClientRequest) throws -> ClientResponse

    func delegating(to eventLoop: any EventLoop) -> any Client {
        StubClient(eventLoop: eventLoop, respond: respond)
    }

    func send(_ request: ClientRequest) -> EventLoopFuture<ClientResponse> {
        eventLoop.makeCompletedFuture { try respond(request) }
    }
}

private final class RequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [String] = []
    var urls: [String] { lock.withLock { stored } }
    func record(_ url: String) { lock.withLock { stored.append(url) } }
}

@Test func censoEscolarAcceptsNullsAndSymbols() throws {
    let sources = try validSources()
    try GuanambiService.validate(sources)
    let values = sources.censoEscolar[0].res[0].res
    #expect(values["2025"] == .some("11515"))
    #expect(values["2010"] == .some("-"))
    #expect(values["2008"] == .some(nil))
}

@Test func censoEscolarRejectsUnexpectedData() throws {
    for invalid in [
        censoEscolarBody.replacingOccurrences(of: "5908", with: "99999"),
        censoEscolarBody.replacingOccurrences(of: "291170", with: "292740"),
        censoEscolarBody.replacingOccurrences(of: "\"2024\":\"11552\"", with: "\"ano\":\"11552\"")
    ] {
        let indicators = try decode([IBGECidadesIndicator].self, invalid)
        #expect(throws: IBGEError.self) { try GuanambiService.validateCensoEscolar(indicators) }
    }
}

@Test func censo2022RequiresPercentAndClassifications() throws {
    let sources = try validSources()
    for invalid in [
        alfabetizacaoBody.replacingOccurrences(of: "\"%\"", with: "\"Pessoas\""),
        alfabetizacaoBody.replacingOccurrences(of: "\"287\"", with: "\"999\"")
    ] {
        let broken = GuanambiSources(
            censoEscolar: sources.censoEscolar,
            alfabetizacao: try decode([IBGEVariable].self, invalid),
            frequenciaEscolar: sources.frequenciaEscolar
        )
        #expect(throws: IBGEError.self) { try GuanambiService.validate(broken) }
    }
}

@Test func guanambiRouteReturnsContractAndUsesCache() async throws {
    let log = RequestLog()
    try await withApp(configure: { app in
        app.clients.use { app in
            StubClient(eventLoop: app.eventLoopGroup.next()) { request in
                #expect(request.method == .GET)
                #expect(request.timeout == .seconds(20))
                let url = request.url.string
                log.record(url)
                let body = url == GuanambiService.censoEscolarURL.absoluteString ? censoEscolarBody
                    : url == GuanambiService.alfabetizacaoURL.absoluteString ? alfabetizacaoBody
                    : url == GuanambiService.frequenciaEscolarURL.absoluteString ? frequenciaBody
                    : "[]"
                return ClientResponse(status: .ok, body: ByteBuffer(string: body))
            }
        }
        try configure(app)
    }) { app in
        for _ in 0..<2 {
            try await app.testing().test(.GET, "/api/guanambi", afterResponse: { response async throws in
                #expect(response.status == .ok)
                #expect(response.headers.first(name: "Cache-Control") == "no-store")
                let payload = try JSONDecoder().decode(GuanambiPayload.self, from: Data(response.body.readableBytesView))
                #expect(payload.provider == "swift")
                #expect(payload.municipalityId == "2911709")
                #expect(payload.censoEscolar[0].id == 5908)
                #expect(payload.alfabetizacao[0].resultados[0].series.count == 2)
                #expect(payload.frequenciaEscolar[0].id == "3795")
                #expect(payload.sourceUrls == GuanambiService.sourceUrls)
            })
        }
        try await app.testing().test(.POST, "/api/guanambi", afterResponse: { response async in
            #expect(response.status == .methodNotAllowed)
            #expect(response.headers.first(name: "Allow") == "GET")
        })
    }
    // Uma consulta por fonte: a segunda requisição usa o cache.
    #expect(Set(log.urls) == Set(GuanambiService.sourceUrls.values))
    #expect(log.urls.count == 3)
}

@Test func guanambiRouteHandlesUpstreamErrors() async throws {
    for timeout in [false, true] {
        let guanambi = GuanambiService(load: {
            if timeout { throw IBGEError.timeout }
            throw IBGEError.invalidResponse
        })
        try await withApp(configure: { app in try configure(app, guanambi: guanambi) }) { app in
            try await app.testing().test(.GET, "/api/guanambi", afterResponse: { response async in
                #expect(response.status == (timeout ? .gatewayTimeout : .badGateway))
                #expect(response.headers.first(name: "Cache-Control") == "no-store")
            })
            try await app.testing().test(.GET, "/health", afterResponse: { response async in
                #expect(response.status == .ok)
            })
        }
    }
}

@Test func oneFailingSourceFailsTheWholeQuery() async throws {
    try await withApp { app in
        let client = StubClient(eventLoop: app.eventLoopGroup.next()) { request in
            if request.url.string == GuanambiService.frequenciaEscolarURL.absoluteString {
                return ClientResponse(status: .serviceUnavailable)
            }
            return ClientResponse(status: .ok, body: ByteBuffer(string: request.url.string == GuanambiService.censoEscolarURL.absoluteString ? censoEscolarBody : alfabetizacaoBody))
        }
        await #expect(throws: IBGEError.self) { try await fetchGuanambiSources(using: client) }
    }
}
