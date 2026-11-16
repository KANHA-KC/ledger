import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppShell } from '../components/AppShell'

export const metadata: Metadata = {
  title: 'Hisaab — Smart Ledger for Business',
  description: 'Bilingual (हिंदी / English) Apple-designed offline-first business ledger.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Hisaab',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="hi" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('theme');
                  // Default to clean Apple Light Mode
                  if (stored === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#F2F2F7] text-neutral-900 antialiased dark:bg-black dark:text-white">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
