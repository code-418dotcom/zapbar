// swift-tools-version:5.9
// Tests for the widget extension's core (targets/widgets/Core, symlinked as Sources/QuickCore).
// Run on the Mac: cd apps/remote/ios-tests && swift test
import PackageDescription

let package = Package(
  name: "QuickCore",
  platforms: [.macOS(.v14), .iOS(.v17)],
  targets: [
    .target(name: "QuickCore", path: "Sources/QuickCore"),
    .testTarget(name: "QuickCoreTests", dependencies: ["QuickCore"], path: "Tests/QuickCoreTests"),
  ]
)
