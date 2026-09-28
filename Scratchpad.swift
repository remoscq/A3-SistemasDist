import Foundation 

// Scratchpad para testes

struct Todo: Decodable {
let userId: Int
let id: Int
let title: String
let completed: Bool
}


let url = URL(string:"https://jsonplaceholder.typicode.com/todos/1")!
let (data, response) = try await URLSession.shared.data(from: url)

let todo = try JSONDecoder().decode(Todo.self, from: data)

print(todo.title) 
