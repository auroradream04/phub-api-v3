'use client'

import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AdminLayout({
  children
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/login')
      return
    }
    const userRole = (session.user as { role?: string })?.role
    if (userRole !== 'admin') {
      router.push('/')
      return
    }
  }, [session, status, router])

  const userRole = (session?.user as { role?: string })?.role
  if (status === 'loading' || !session || userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    )
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin' },
    { name: 'Ads', href: '/admin/ads' },
    { name: 'Embeds', href: '/admin/embeds' },
    { name: 'Domains', href: '/admin/domains' },
    { name: 'Settings', href: '/admin/settings' }
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Minimal top bar */}
      <nav className="border-b border-zinc-800/50">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-medium text-zinc-100">
              Admin
            </Link>
            <div className="flex gap-4">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`text-xs transition-colors ${
                    pathname === item.href
                      ? 'text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
