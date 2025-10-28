'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Send } from 'lucide-react'

export function Header() {
  const pathname = usePathname()

  const navigation = [
    { name: '首页', href: '/' },
    { name: '热门', href: '/trending' },
    { name: '分类', href: '/categories' },
    { name: '文档', href: '/docs' },
  ]

  // Don't show header on admin pages - they have their own nav
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/login') || pathname?.startsWith('/register')) {
    return null
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-0">
        {/* Logo + Main Navigation */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
            <Image
              src="/logo.png"
              alt="MD8AV Logo"
              width={50}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </Link>

          {/* Navigation */}
          <nav className="hidden sm:flex items-center space-x-6">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Telegram Link */}
        <Link
          href="https://t.me/your_channel"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0088cc] hover:opacity-80 transition-opacity"
          aria-label="Join our Telegram channel"
        >
          <Send className="w-4 h-4 text-white" />
        </Link>
      </div>
    </header>
  )
}
