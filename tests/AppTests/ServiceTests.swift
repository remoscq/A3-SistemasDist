import Foundation
import IBGECore
import Testing

actor SourceStub {
    private(set) var calls = 0
    var failures: Int
    init(failures: Int = 0) { self.failures = failures }
    func load() async throws -> [IBGEVariable] {
        calls += 1
        if failures > 0 {
            failures -= 1
            throw IBGEError.invalidResponse
        }
        try await Task.sleep(for: .milliseconds(10))
        return []
    }
}

@Test func concurrentRequestsShareCache() async throws {
    let source = SourceStub()
    let service = IndicatorsService(load: { try await source.load() })
    async let a = service.indicators()
    async let b = service.indicators()
    let (first, second) = try await (a, b)
    let third = try await service.indicators()
    #expect(await source.calls == 1)
    #expect(first.fetchedAt == second.fetchedAt)
    #expect(first.fetchedAt == third.fetchedAt)
    #expect(first.provider == "swift")
    #expect(first.sourceUrl == IndicatorsService.sourceURL.absoluteString)
}

@Test func expiredCacheIsRefreshed() async throws {
    let source = SourceStub()
    let service = IndicatorsService(ttl: .zero, load: { try await source.load() })
    _ = try await service.indicators()
    _ = try await service.indicators()
    #expect(await source.calls == 2)
}

@Test func failureAllowsRetry() async throws {
    let source = SourceStub(failures: 1)
    let service = IndicatorsService(load: { try await source.load() })
    await #expect(throws: IBGEError.self) { try await service.indicators() }
    let payload = try await service.indicators()
    #expect(payload.variables.isEmpty)
    #expect(await source.calls == 2)
}

@Test func validatesPopulationAndUnits() throws {
    let valid = #"[{"id":"10276","variavel":"Taxa","unidade":"%","resultados":[{"classificacoes":[{"id":"58","nome":"Idade","categoria":{"1":"Total"}},{"id":"86","nome":"Cor","categoria":{"2":"Total"}}],"series":[{"localidade":{"id":"29","nome":"Bahia"},"serie":{"2024":"0.0","2025":"..."}}]}]}]"#
    let decoder = JSONDecoder()
    try IndicatorsService.validate(decoder.decode([IBGEVariable].self, from: Data(valid.utf8)))
    for invalid in [valid.replacingOccurrences(of: "\"%\"", with: "\"Pessoas\""), valid.replacingOccurrences(of: "\"58\"", with: "\"99\""), valid.replacingOccurrences(of: "\"2024\"", with: "\"ano\"")] {
        let variables = try decoder.decode([IBGEVariable].self, from: Data(invalid.utf8))
        #expect(throws: IBGEError.self) { try IndicatorsService.validate(variables) }
    }
}
