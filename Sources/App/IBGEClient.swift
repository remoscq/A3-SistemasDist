import Foundation
import IBGECore
import Vapor

/// Consulta uma URL fixa do IBGE e decodifica o JSON. Respostas acima de 5 MiB são rejeitadas.
func fetchIBGEJSON<T: Decodable>(_ type: T.Type, from url: URL, using client: any Client) async throws -> T {
    do {
        let response = try await client.get(
            URI(string: url.absoluteString),
            headers: ["Accept": "application/json"]
        ) { request in
            request.timeout = .seconds(20)
        }
        guard response.status == .ok, let body = response.body,
              body.readableBytes <= 5 * 1024 * 1024 else { throw IBGEError.invalidResponse }
        return try JSONDecoder().decode(T.self, from: Data(body.readableBytesView))
    } catch let error as HTTPClientError where [
        .deadlineExceeded, .readTimeout, .connectTimeout, .writeTimeout,
        .tlsHandshakeTimeout, .getConnectionFromPoolTimeout
    ].contains(error) {
        throw IBGEError.timeout
    }
}

func fetchIBGEVariables(using client: any Client) async throws -> [IBGEVariable] {
    try await fetchIBGEJSON([IBGEVariable].self, from: IndicatorsService.sourceURL, using: client)
}

/// Consulta as três fontes de Guanambi em paralelo. Se uma falhar, a consulta inteira falha.
func fetchGuanambiSources(using client: any Client) async throws -> GuanambiSources {
    async let censoEscolar = fetchIBGEJSON([IBGECidadesIndicator].self, from: GuanambiService.censoEscolarURL, using: client)
    async let alfabetizacao = fetchIBGEJSON([IBGEVariable].self, from: GuanambiService.alfabetizacaoURL, using: client)
    async let frequencia = fetchIBGEJSON([IBGEVariable].self, from: GuanambiService.frequenciaEscolarURL, using: client)
    return try await GuanambiSources(
        censoEscolar: censoEscolar,
        alfabetizacao: alfabetizacao,
        frequenciaEscolar: frequencia
    )
}
