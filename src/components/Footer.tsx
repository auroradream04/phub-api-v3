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
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8">
          {/* Brand Section */}
          <div className="md:col-span-4">
            <Link href="/" className="inline-block mb-4">
              <Image
                src="/logo.png"
                alt="MD8AV"
                width={300}
                height={100}
                quality={100}
                className="h-10 w-auto"
              />
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              高品质视频内容聚合平台
            </p>
          </div>

          {/* Legal Links */}
          <div className="md:col-span-3">
            <h3 className="font-semibold mb-4 text-sm">法律信息</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/privacy"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  隐私政策
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  服务条款
                </Link>
              </li>
              <li>
                <Link
                  href="/dmca"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  DMCA政策
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div className="md:col-span-3">
            <h3 className="font-semibold mb-4 text-sm">资源</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/sitemap.xml"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  网站地图
                </Link>
              </li>
              <li>
                <Link
                  href="/feed.xml"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  RSS订阅
                </Link>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div className="md:col-span-2">
            <h3 className="font-semibold mb-4 text-sm">关注我们</h3>
            <Link
              href={process.env.NEXT_PUBLIC_TELEGRAM_LINK || 'https://t.me/your_channel'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#0088cc]">
                <Send className="w-3 h-3 text-white" />
              </div>
              电报
            </Link>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground text-center md:text-left">
            © {currentYear} MD8AV. 保留所有权利。
          </p>
        </div>
      </div>
    </footer>
  )
}
