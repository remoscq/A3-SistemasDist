import Foundation

public struct IBGEVariable: Codable, Sendable {
    public let id: String
    public let variavel: String
    public let unidade: String
    public let resultados: [IBGEResult]
}

public struct IBGEResult: Codable, Sendable {
    public let classificacoes: [IBGEClassification]
    public let series: [IBGESeries]
}

public struct IBGEClassification: Codable, Sendable {
    public let id: String
    public let nome: String
    public let categoria: [String: String]
}

public struct IBGESeries: Codable, Sendable {
    public let localidade: IBGELocation
    public let serie: [String: String]
}

public struct IBGELocation: Codable, Sendable {
    public let id: String
    public let nome: String
}

public struct IndicatorsPayload: Codable, Sendable {
    public let variables: [IBGEVariable]
    public let fetchedAt: String
    public let sourceUrl: String
    public let provider: String
}

public enum IBGEError: Error, Equatable {
    case invalidResponse
    case timeout
}

public actor IndicatorsService {
    public static let sourceURL = URL(string: "https://servicodados.ibge.gov.br/api/v3/agregados/7139/periodos/-10/variaveis/all?localidades=N3%5B29%5D&classificacao=58%5Ball%5D%7C86%5Ball%5D")!
    public typealias Loader = @Sendable () async throws -> [IBGEVariable]

    private let load: Loader
    private let ttl: Duration
    private let clock = ContinuousClock()
    private var cached: IndicatorsPayload?
    private var cachedAt: ContinuousClock.Instant?
    private var pending: Task<IndicatorsPayload, Error>?

    public init(ttl: Duration = .seconds(900), load: @escaping Loader) {
        self.ttl = ttl
        self.load = load
    }

    public func indicators() async throws -> IndicatorsPayload {
        if let cached, let cachedAt, cachedAt.duration(to: clock.now) < ttl {
            return cached
        }
        if let pending { return try await pending.value }
        let load = self.load
        let task = Task {
            let variables = try await load()
            try Self.validate(variables)
            return IndicatorsPayload(
                variables: variables,
                fetchedAt: ISO8601DateFormatter().string(from: Date()),
                sourceUrl: Self.sourceURL.absoluteString,
                provider: "swift"
            )
        }
        pending = task
        do {
            let payload = try await task.value
            cached = payload
            cachedAt = clock.now
            pending = nil
            return payload
        } catch {
            pending = nil
            throw error
        }
    }

    public static func validate(_ variables: [IBGEVariable]) throws {
        func valid(_ value: String) -> Bool { !value.isEmpty && value.count <= 1000 }
        guard variables.count <= 100 else { throw IBGEError.invalidResponse }
        for variable in variables {
            guard valid(variable.id), valid(variable.variavel) else { throw IBGEError.invalidResponse }
            let known = ["10276", "10277"].contains(variable.id)
            if known && variable.unidade != "%" { throw IBGEError.invalidResponse }
            for result in variable.resultados {
                if known {
                    for id in ["58", "86"] {
                        guard let classification = result.classificacoes.first(where: { $0.id == id }),
                              classification.categoria.count == 1 else { throw IBGEError.invalidResponse }
                    }
                }
                for classification in result.classificacoes {
                    guard valid(classification.id), valid(classification.nome),
                          classification.categoria.allSatisfy({ valid($0.key) && valid($0.value) })
                    else { throw IBGEError.invalidResponse }
                }
                for series in result.series {
                    guard valid(series.localidade.id), valid(series.localidade.nome),
                          series.serie.allSatisfy({
                              $0.key.range(of: #"^[0-9]{4}$"#, options: .regularExpression) != nil && $0.value.count <= 100
                          }) else { throw IBGEError.invalidResponse }
                }
            }
        }
    }
}
