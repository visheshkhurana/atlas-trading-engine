import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'ATLAS - Autonomous Trading & Liquidity Analysis System',
  description: 'Institutional-grade AI crypto trading engine',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${jetbrains.variable} font-mono bg-atlas-bg text-atlas-text min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  )
}
