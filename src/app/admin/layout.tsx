'use client'

import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LayoutDashboard, Megaphone, Link2, Globe, Settings, LogOut } from 'lucide-react'

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
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Ads', href: '/admin/ads', icon: Megaphone },
    { name: 'Embeds', href: '/admin/embeds', icon: Link2 },
    { name: 'Domains', href: '/admin/domains', icon: Globe },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="p-5 border-b border-zinc-800">
          <span className="text-base font-semibold">Admin</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-purple-600/20 text-purple-400'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-purple-400' : ''}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
