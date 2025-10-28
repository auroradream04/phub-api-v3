'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Send } from 'lucide-react'

export function Footer() {
  const pathname = usePathname()

  // Don't show footer on admin pages
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/login') || pathname?.startsWith('/register')) {
    return null
  }

  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-card">
      <div className="px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {currentYear} MD8AV. 保留所有权利。
          </p>
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
      </div>
    </footer>
  )
}
