// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.2"),
        .package(name: "CapacitorCommunityInAppReview", path: "../../../node_modules/@capacitor-community/in-app-review"),
        .package(name: "CapacitorCommunityKeepAwake", path: "../../../node_modules/@capacitor-community/keep-awake"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../node_modules/@capacitor/browser"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/@capacitor/haptics"),
        .package(name: "CapacitorPreferences", path: "../../../node_modules/@capacitor/preferences")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityInAppReview", package: "CapacitorCommunityInAppReview"),
                .product(name: "CapacitorCommunityKeepAwake", package: "CapacitorCommunityKeepAwake"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences")
            ]
        )
    ]
)
