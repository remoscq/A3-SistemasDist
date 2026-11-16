@testable import App
import IBGECore
import Testing
import VaporTesting

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

private let validBody = #"[{"id":"10276","variavel":"Taxa","unidade":"%","resultados":[{"classificacoes":[{"id":"58","nome":"Idade","categoria":{"1":"Total"}},{"id":"86","nome":"Cor","categoria":{"2":"Total"}}],"series":[{"localidade":{"id":"29","nome":"Bahia"},"serie":{"2024":"0.0","2025":"..."}}]}]}]"#

@Test func defaultRoutesUseVaporClient() async throws {
    try await withApp(configure: { app in
        app.clients.use { app in
            StubClient(eventLoop: app.eventLoopGroup.next()) { request in
                #expect(request.method == .GET)
                #expect(request.url.string == IndicatorsService.sourceURL.absoluteString)
                #expect(request.headers.first(name: "Accept") == "application/json")
                #expect(request.timeout == .seconds(20))
                return ClientResponse(status: .ok, body: ByteBuffer(string: validBody))
            }
        }
        try configure(app)
    }) { app in
        for _ in 0..<3 {
            try await app.testing().test(.GET, "/api/indicadores", afterResponse: { response async throws in
                #expect(response.status == .ok)
                let payload = try JSONDecoder().decode(IndicatorsPayload.self, from: Data(response.body.readableBytesView))
                #expect(payload.provider == "swift")
                #expect(payload.variables[0].resultados[0].series[0].serie["2024"] == "0.0")
            })
        }
    }
}

@Test func httpClientErrorsDoNotTerminateServer() async throws {
    for failure in [HTTPClientError.deadlineExceeded, .readTimeout, .connectTimeout, .remoteConnectionClosed] {
        try await withApp(configure: { app in
            app.clients.use { app in
                StubClient(eventLoop: app.eventLoopGroup.next()) { _ in throw failure }
            }
            try configure(app)
        }) { app in
            try await app.testing().test(.GET, "/api/indicadores", afterResponse: { response async in
                #expect(response.status == (failure == .remoteConnectionClosed ? .badGateway : .gatewayTimeout))
                #expect(response.headers.first(name: "Cache-Control") == "no-store")
            })
            try await app.testing().test(.GET, "/health", afterResponse: { response async in
                #expect(response.status == .ok)
            })
        }
    }
}

@Test func invalidUpstreamResponsesAreRejected() async throws {
    for response in [
        ClientResponse(status: .serviceUnavailable),
        ClientResponse(status: .ok),
        ClientResponse(status: .ok, body: ByteBuffer(string: "não é JSON")),
        ClientResponse(status: .ok, body: ByteBuffer(repeating: 32, count: 5 * 1024 * 1024 + 1))
    ] {
        try await withApp { app in
            let client = StubClient(eventLoop: app.eventLoopGroup.next()) { _ in response }
            await #expect(throws: (any Error).self) { try await fetchIBGEVariables(using: client) }
        }
    }
}
