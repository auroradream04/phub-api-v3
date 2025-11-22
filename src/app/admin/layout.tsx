'use client'

import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
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
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="MD8AV Logo"
                  width={300}
                  height={100}
                  quality={100}
                  className="h-10 w-auto"
                  priority
                />
              </Link>
              <div className="hidden sm:flex sm:space-x-2">
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
            <div className="flex items-center gap-4">
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
      <main className="px-4 sm:px-6 lg:px-0">
        <div className="max-w-[800px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}