import type { Metadata } from 'next'
import Link from 'next/link'
import { Code, Zap } from 'lucide-react'

export const metadata: Metadata = {
  title: '文档中心 - MD8AV',
  description: 'MD8AV API文档和集成指南。学习如何将我们的视频资源API集成到您的CMS系统中，支持MacCMS等多种平台。',
  keywords: ['API文档', 'CMS集成', 'MacCMS', 'API指南', 'MD8AV文档', '视频API'],
}

export default function DocsHome() {
  const cmsGuides = [
    {
      name: 'MacCMS (苹果CMS)',
      slug: 'maccms',
      description: '将我们的API集合接入到MacCMS系统，支持M3U8在线播放和下载资源的采集。',
      icon: 'https://via.placeholder.com/48/3b82f6/ffffff?text=MC',
      status: '已完成'
    },
    {
      name: '其他CMS',
      slug: 'other-cms',
      description: '更多CMS集成指南敬请期待...',
      icon: 'https://via.placeholder.com/48/6366f1/ffffff?text=+',
      status: '开发中',
      disabled: true
    }
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-16 py-12">
        {/* Quick Start */}
        <div className="bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 rounded-2xl p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-3">
                <Zap className="w-6 h-6 text-primary" />
                快速开始
              </h2>
              <p className="text-muted-foreground mb-6">
                选择您使用的CMS系统，按照步骤指南进行集成。整个过程通常只需5-10分钟。
              </p>
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                    1
                  </span>
                  <span className="text-foreground">选择您的CMS系统</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                    2
                  </span>
                  <span className="text-foreground">按照指南配置API</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                    3
                  </span>
                  <span className="text-foreground">测试并开始使用</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-accent text-white text-4xl font-bold">
                  <Code className="w-12 h-12" />
                </div>
                <p className="text-foreground mt-4 font-semibold">易于集成</p>
                <p className="text-sm text-muted-foreground">无需复杂配置</p>
              </div>
            </div>
          </div>
        </div>

        {/* CMS Guides */}
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">支持的平台</h2>
            <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {cmsGuides.map((cms) => (
              <Link
                key={cms.slug}
                href={cms.disabled ? '#' : `/docs/${cms.slug}`}
                className={`group rounded-2xl border-2 p-8 transition-all ${
                  cms.disabled
                    ? 'border-border bg-muted/30 cursor-not-allowed opacity-75'
                    : 'border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                      {cms.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {cms.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    cms.status === '已完成'
                      ? 'bg-green-900/20 text-green-500'
                      : 'bg-yellow-900/20 text-yellow-500'
                  }`}>
                    {cms.status}
                  </span>
                  {!cms.disabled && (
                    <span className="text-sm text-primary font-medium group-hover:translate-x-1 transition-transform">
                      查看指南 →
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">常见问题</h2>
            <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          </div>

          <div className="grid gap-4">
            {[
              {
                q: '集成过程需要多长时间？',
                a: '通常只需5-10分钟。只需获取API端点并在您的CMS系统中配置即可。'
              },
              {
                q: '我需要特殊的权限或密钥吗？',
                a: '大多数集成不需要身份验证。某些功能可能需要管理员权限。详见各个CMS的指南。'
              },
              {
                q: '如果集成失败怎么办？',
                a: '每个指南都包含常见问题解决方案。如果问题仍未解决，请加入我们的 Telegram 群组寻求帮助。',
                link: process.env.NEXT_PUBLIC_TELEGRAM_LINK || 'https://t.me/md8av'
              },
              {
                q: '需要付费吗？',
                a: '完全免费！我们的API和所有内容都可以自由采集使用，无需任何费用。'
              }
            ].map((faq, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-all">
                <h4 className="font-bold text-foreground mb-2">{faq.q}</h4>
                <p className="text-muted-foreground">
                  {faq.a}
                  {faq.link && (
                    <>
                      {' '}
                      <a
                        href={faq.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent font-semibold hover:underline"
                      >
                        {faq.link}
                      </a>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Support */}
        <div className="bg-card border-2 border-dashed border-primary/30 rounded-2xl p-8 text-center">
          <p className="text-muted-foreground mb-4">
            需要帮助？查看详细的集成指南或根据指南中的说明进行操作。
          </p>
          <p className="text-sm text-muted-foreground">
            每个CMS指南都包含分步骤的说明、屏幕截图和常见问题解决方案。
          </p>
        </div>
      </div>
    </div>
  )
}
