@testable import App
import Foundation
import IBGECore
import Testing
import VaporTesting

@Test func routesReturnSwiftContract() async throws {
    let source = SourceStub()
    let service = IndicatorsService(load: { try await source.load() })
    try await withApp(configure: { app in try configure(app, service: service) }) { app in
        try await app.testing().test(.GET, "/api/indicadores", afterResponse: { response async throws in
            #expect(response.status == .ok)
            let payload = try JSONDecoder().decode(IndicatorsPayload.self, from: Data(response.body.readableBytesView))
            #expect(payload.provider == "swift")
            #expect(payload.variables.isEmpty)
            #expect(response.headers.first(name: "Cache-Control") == "no-store")
            #expect(response.headers.first(name: "X-Content-Type-Options") == "nosniff")
        })
        try await app.testing().test(.POST, "/api/indicadores", afterResponse: { response async in
            #expect(response.status == .methodNotAllowed)
            #expect(response.headers.first(name: "Allow") == "GET")
        })
        try await app.testing().test(.GET, "/health", afterResponse: { response async in
            #expect(response.status == .ok)
        })
        try await app.testing().test(.GET, "/api/inexistente", afterResponse: { response async in
            #expect(response.status == .notFound)
            #expect(response.headers.first(name: "X-Content-Type-Options") == "nosniff")
        })
    }
    #expect(await source.calls == 1)
}

@Test func routesHandleUpstreamErrors() async throws {
    for timeout in [false, true] {
        let service = IndicatorsService(load: {
            if timeout { throw IBGEError.timeout }
            throw IBGEError.invalidResponse
        })
        try await withApp(configure: { app in try configure(app, service: service) }) { app in
            try await app.testing().test(.GET, "/api/indicadores", afterResponse: { response async in
                #expect(response.status == (timeout ? .gatewayTimeout : .badGateway))
                #expect(response.headers.first(name: "Cache-Control") == "no-store")
            })
        }
    }
}
