import SwiftUI

extension Color {
    static let orangePrimary = Color(hex: 0xFF6600)
    static let orangeDark = Color(hex: 0xCC5200)
    static let orangeLight = Color(hex: 0xFF8833)
    static let bgBlack = Color(hex: 0x0A0A0A)
    static let bgCard = Color(hex: 0x141414)
    static let bgCardElevated = Color(hex: 0x1C1C1C)
    static let borderCard = Color(hex: 0x2A2A2A)
    static let textSecondary = Color(hex: 0xB0B0B0)
    static let textDim = Color(hex: 0x555555)
    static let greenActive = Color(hex: 0x00CC66)
    static let redError = Color(hex: 0xFF3333)

    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
