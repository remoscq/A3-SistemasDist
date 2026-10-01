import Foundation
import FoundationNetworking
// Scratchpad para testes

struct IBGEVariable: Decodable {
    let id: String
    let variavel: String
    let unidade: String
    let resultados: [IBGEResult]
}

struct IBGEResult: Decodable {
    let classificacoes: [IBGEClassification]
    let series: [IBGESeries]
}

struct IBGEClassification: Decodable {
    let nome: String
    let categoria: [String: String]
}

struct IBGESeries: Decodable {
    let localidade: IBGELocation
    let serie: [String: String]
}

struct IBGELocation: Decodable {
    let id: String
    let nome: String
}

let url = URL(
    string: "https://servicodados.ibge.gov.br/api/v3/agregados/7139/periodos/-1/variaveis/all?localidades=N3%5B29%5D"
)!

let (data, response) = try await URLSession.shared.data(from: url)

guard let httpResponse = response as? HTTPURLResponse,
      httpResponse.statusCode == 200 else {
    throw URLError(.badServerResponse)
}

let variables = try JSONDecoder().decode(
    [IBGEVariable].self,
    from: data
)

for variable in variables {
    print("\nIndicador:", variable.variavel)

    for result in variable.resultados {
        for classification in result.classificacoes {
            let categories = classification.categoria.values
                .sorted()
                .joined(separator: ", ")

            print("\(classification.nome): \(categories)")
        }

        for series in result.series {
            print("Local:", series.localidade.nome)

            for year in series.serie.keys.sorted() {
                if let value = series.serie[year] {
                    print("\(year): \(value) \(variable.unidade)")
                }
            }
        }

        print("---")
    }
}
