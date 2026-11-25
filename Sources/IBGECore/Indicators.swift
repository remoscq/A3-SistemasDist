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

public struct IndicatorsService: Sendable {
    public static let sourceURL = URL(string: "https://servicodados.ibge.gov.br/api/v3/agregados/7139/periodos/-10/variaveis/all?localidades=N3%5B29%5D&classificacao=58%5Ball%5D%7C86%5Ball%5D")!
    public typealias Loader = @Sendable () async throws -> [IBGEVariable]

    private let cache: CachedLoader<IndicatorsPayload>

    public init(ttl: Duration = .seconds(900), load: @escaping Loader) {
        cache = CachedLoader(ttl: ttl) {
            let variables = try await load()
            try Self.validate(variables)
            return IndicatorsPayload(
                variables: variables,
                fetchedAt: timestamp(),
                sourceUrl: Self.sourceURL.absoluteString,
                provider: "swift"
            )
        }
    }

    public func indicators() async throws -> IndicatorsPayload {
        try await cache.value()
    }

    public static func validate(_ variables: [IBGEVariable]) throws {
        try validateAgregados(variables, required: ["10276": ["58", "86"], "10277": ["58", "86"]])
    }
}

func validText(_ value: String) -> Bool { !value.isEmpty && value.count <= 1000 }

func validYear(_ value: String) -> Bool {
    value.range(of: #"^[0-9]{4}$"#, options: .regularExpression) != nil
}

/// Valida respostas da API de agregados (v3) do IBGE.
/// Para cada variável conhecida em `required`, exige unidade "%" e uma única categoria
/// em cada classificação informada.
public func validateAgregados(_ variables: [IBGEVariable], required: [String: [String]]) throws {
    guard variables.count <= 100 else { throw IBGEError.invalidResponse }
    for variable in variables {
        guard validText(variable.id), validText(variable.variavel) else { throw IBGEError.invalidResponse }
        let classifications = required[variable.id]
        if classifications != nil && variable.unidade != "%" { throw IBGEError.invalidResponse }
        for result in variable.resultados {
            for id in classifications ?? [] {
                guard let classification = result.classificacoes.first(where: { $0.id == id }),
                      classification.categoria.count == 1 else { throw IBGEError.invalidResponse }
            }
            for classification in result.classificacoes {
                guard validText(classification.id), validText(classification.nome),
                      classification.categoria.allSatisfy({ validText($0.key) && validText($0.value) })
                else { throw IBGEError.invalidResponse }
            }
            for series in result.series {
                guard validText(series.localidade.id), validText(series.localidade.nome),
                      series.serie.allSatisfy({ validYear($0.key) && $0.value.count <= 100 })
                else { throw IBGEError.invalidResponse }
            }
        }
    }
}
