import Foundation

/// Mantém o último valor carregado por um período e compartilha consultas em andamento.
/// Requisições simultâneas aguardam a mesma tarefa, evitando chamadas externas duplicadas.
public actor CachedLoader<Value: Sendable> {
    public typealias Loader = @Sendable () async throws -> Value

    private let load: Loader
    private let ttl: Duration
    private let clock = ContinuousClock()
    private var cached: Value?
    private var cachedAt: ContinuousClock.Instant?
    private var pending: Task<Value, Error>?

    public init(ttl: Duration, load: @escaping Loader) {
        self.ttl = ttl
        self.load = load
    }

    public func value() async throws -> Value {
        if let cached, let cachedAt, cachedAt.duration(to: clock.now) < ttl {
            return cached
        }
        if let pending { return try await pending.value }
        let task = Task(operation: load)
        pending = task
        do {
            let value = try await task.value
            cached = value
            cachedAt = clock.now
            pending = nil
            return value
        } catch {
            pending = nil
            throw error
        }
    }
}

func timestamp() -> String {
    ISO8601DateFormatter().string(from: Date())
}
