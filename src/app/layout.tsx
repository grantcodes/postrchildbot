import type { Metadata, Viewport } from 'next'
import Image from 'next/image'
import { Monoton } from 'next/font/google'
import '../../public/static/style.css'

import logo from '../../public/static/img/postrchild-icon.svg'

const monoton = Monoton({
  weight: '400',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'PostrChild',
  manifest: '/static/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#f8e5f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <header className="h-x-app h-app">
          <h1 className={monoton.className}>
            <a href="https://postrchild.com" className="u-url">
              <Image className="u-logo" src={logo} alt="" aria-hidden="true" />
              <span className="p-name">PostrChild</span>
            </a>
          </h1>
        </header>
        <main>
          <div className="main-content">{children}</div>
        </main>
        <footer>
          <p>
            By <a href="https://grant.codes">grant.codes</a>
          </p>
          <p>
            Source code available on{' '}
            <a href="https://github.com/terminalpixel/postrchildbot">GitHub</a>
          </p>
        </footer>
      </body>
    </html>
  )
}
