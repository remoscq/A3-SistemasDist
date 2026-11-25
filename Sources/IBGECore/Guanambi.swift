import Foundation

/// Indicador da API de pesquisas do IBGE Cidades (v1), usada para o Censo Escolar do INEP.
/// Os valores podem vir como `null` ou como símbolos de indisponibilidade, como "-".
public struct IBGECidadesIndicator: Codable, Sendable {
    public let id: Int
    public let res: [IBGECidadesResult]
}

public struct IBGECidadesResult: Codable, Sendable {
    public let localidade: String
    public let res: [String: String?]
}

/// Respostas das três fontes, antes da validação.
public struct GuanambiSources: Sendable {
    public let censoEscolar: [IBGECidadesIndicator]
    public let alfabetizacao: [IBGEVariable]
    public let frequenciaEscolar: [IBGEVariable]

    public init(censoEscolar: [IBGECidadesIndicator], alfabetizacao: [IBGEVariable], frequenciaEscolar: [IBGEVariable]) {
        self.censoEscolar = censoEscolar
        self.alfabetizacao = alfabetizacao
        self.frequenciaEscolar = frequenciaEscolar
    }
}

public struct GuanambiPayload: Codable, Sendable {
    public let municipalityId: String
    public let censoEscolar: [IBGECidadesIndicator]
    public let alfabetizacao: [IBGEVariable]
    public let frequenciaEscolar: [IBGEVariable]
    public let fetchedAt: String
    public let sourceUrls: [String: String]
    public let provider: String
}

public struct GuanambiService: Sendable {
    /// Código IBGE de Guanambi (BA). A API de pesquisas devolve a localidade com 6 dígitos (sem o verificador).
    public static let municipalityId = "2911709"
    public static let shortMunicipalityId = "291170"

    /// Matrículas, docentes e escolas da educação infantil, do ensino fundamental e do ensino médio.
    public static let censoEscolarIndicators: Set<Int> = [77881, 5908, 5913, 77887, 5929, 5934, 77893, 5950, 5955]

    public static let censoEscolarURL = URL(string: "https://servicodados.ibge.gov.br/api/v1/pesquisas/13/periodos/all/indicadores/77881%7C5908%7C5913%7C77887%7C5929%7C5934%7C77893%7C5950%7C5955/resultados/2911709")!
    /// Censo 2022, tabela 9543: taxa de alfabetização das pessoas de 15 anos ou mais, por sexo e cor ou raça.
    public static let alfabetizacaoURL = URL(string: "https://servicodados.ibge.gov.br/api/v3/agregados/9543/periodos/2022/variaveis/2513?localidades=N6%5B2911709%5D%7CN3%5B29%5D&classificacao=2%5Ball%5D%7C86%5Ball%5D%7C287%5B100362%5D")!
    /// Censo 2022, tabela 10056: taxa de frequência escolar bruta por grupo de idade.
    public static let frequenciaEscolarURL = URL(string: "https://servicodados.ibge.gov.br/api/v3/agregados/10056/periodos/2022/variaveis/3795?localidades=N6%5B2911709%5D%7CN3%5B29%5D&classificacao=58%5B95253,99749,47813,31615,2792,100052,108866%5D%7C2%5B6794%5D%7C86%5B95251%5D")!

    public static let sourceUrls = [
        "censoEscolar": censoEscolarURL.absoluteString,
        "alfabetizacao": alfabetizacaoURL.absoluteString,
        "frequenciaEscolar": frequenciaEscolarURL.absoluteString
    ]

    public typealias Loader = @Sendable () async throws -> GuanambiSources

    private let cache: CachedLoader<GuanambiPayload>

    public init(ttl: Duration = .seconds(900), load: @escaping Loader) {
        cache = CachedLoader(ttl: ttl) {
            let sources = try await load()
            try Self.validate(sources)
            return GuanambiPayload(
                municipalityId: Self.municipalityId,
                censoEscolar: sources.censoEscolar,
                alfabetizacao: sources.alfabetizacao,
                frequenciaEscolar: sources.frequenciaEscolar,
                fetchedAt: timestamp(),
                sourceUrls: Self.sourceUrls,
                provider: "swift"
            )
        }
    }

    public func data() async throws -> GuanambiPayload {
        try await cache.value()
    }

    public static func validate(_ sources: GuanambiSources) throws {
        try validateCensoEscolar(sources.censoEscolar)
        try validateAgregados(sources.alfabetizacao, required: ["2513": ["2", "86", "287"]])
        try validateAgregados(sources.frequenciaEscolar, required: ["3795": ["58", "2", "86"]])
    }

    public static func validateCensoEscolar(_ indicators: [IBGECidadesIndicator]) throws {
        guard indicators.count <= censoEscolarIndicators.count else { throw IBGEError.invalidResponse }
        for indicator in indicators {
            guard censoEscolarIndicators.contains(indicator.id), indicator.res.count <= 10 else {
                throw IBGEError.invalidResponse
            }
            for result in indicator.res {
                guard [shortMunicipalityId, municipalityId].contains(result.localidade),
                      result.res.count <= 200,
                      result.res.allSatisfy({ validYear($0.key) && ($0.value?.count ?? 0) <= 100 })
                else { throw IBGEError.invalidResponse }
            }
        }
    }
}
