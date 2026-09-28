import Foundation

// Scratchpad para testes

struct SidraRow: Decodable {
    let NC: String
    let NN: String
    let MC: String
    let MN: String
    let V: String
    let D1C: String
    let D1N: String
    let D2C: String
    let D2N: String
    let D3C: String
    let D3N: String
    let D4C: String
    let D4N: String
    let D5C: String
    let D5N: String
}

let url = URL(string:"https://apisidra.ibge.gov.br/values/t/7139/n3/29/v/all/p/last%201")!

let (data, response) = try await URLSession.shared.data(from: url)

let rows = try JSONDecoder().decode([SidraRow].self, from: data)

print(rows[1].D1N)
print(rows[1].D2N)
print(rows[1].V)