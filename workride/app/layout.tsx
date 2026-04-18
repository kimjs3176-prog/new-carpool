import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '사내 카풀 · WorkRide',
  description: '사내 카풀 매칭 서비스',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
