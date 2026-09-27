import Foundation 

// Scratchpad para testes

let url = URL(string:"https://jsonplaceholder.typicode.com/todos/1")!

let (data, response) = try await URLSession.shared.data(from: url)
let text = String(data: data, encoding: .utf8)!


print(response)
print(text)
