// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "BahiaEducacao",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "App", targets: ["App"])],
    dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.121.4")],
    targets: [
        .target(name: "IBGECore"),
        .executableTarget(name: "App", dependencies: [
            "IBGECore", .product(name: "Vapor", package: "vapor")
        ]),
        .testTarget(name: "AppTests", dependencies: [
            "App", "IBGECore", .product(name: "VaporTesting", package: "vapor")
        ], path: "tests/AppTests")
    ]
)
