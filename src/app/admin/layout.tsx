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

  // Check if user is admin
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

  // Show loading while checking auth
  const userRole = (session?.user as { role?: string })?.role
  if (status === 'loading' || !session || userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
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
    <div className="min-h-screen bg-background">
      <nav className="bg-card border-b border-border">
        <div className="px-6">
          <div className="flex h-16 justify-between">
            <div className="flex">
              <div className="flex flex-shrink-0 items-center">
                <h1 className="text-xl font-bold text-foreground">
                  Admin Panel
                </h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-muted-foreground mr-4">
                {session?.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}