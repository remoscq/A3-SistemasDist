import Foundation
import IBGECore
import Vapor

func fetchIBGEVariables(using client: any Client) async throws -> [IBGEVariable] {
    do {
        let response = try await client.get(
            URI(string: IndicatorsService.sourceURL.absoluteString),
            headers: ["Accept": "application/json"]
        ) { request in
            request.timeout = .seconds(20)
        }
        guard response.status == .ok, let body = response.body,
              body.readableBytes <= 5 * 1024 * 1024 else { throw IBGEError.invalidResponse }
        return try JSONDecoder().decode([IBGEVariable].self, from: Data(body.readableBytesView))
    } catch let error as HTTPClientError where [
        .deadlineExceeded, .readTimeout, .connectTimeout, .writeTimeout,
        .tlsHandshakeTimeout, .getConnectionFromPoolTimeout
    ].contains(error) {
        throw IBGEError.timeout
    }
}
