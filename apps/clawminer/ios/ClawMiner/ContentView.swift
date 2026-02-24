import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = DaemonViewModel()

    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Image(systemName: "house.fill")
                    Text("Home")
                }

            MiningView()
                .tabItem {
                    Image(systemName: "hammer.fill")
                    Text("Mining")
                }

            WalletView()
                .tabItem {
                    Image(systemName: "wallet.pass.fill")
                    Text("Wallet")
                }

            SettingsView()
                .tabItem {
                    Image(systemName: "gearshape.fill")
                    Text("Settings")
                }
        }
        .environmentObject(viewModel)
        .tint(Color.orangePrimary)
        .onAppear {
            configureTabBarAppearance()
            viewModel.start()
        }
    }

    private func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(Color.bgBlack)
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}
