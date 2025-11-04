import type { Metadata } from 'next'
import Link from 'next/link'
import { Send } from 'lucide-react'

export const metadata: Metadata = {
  title: '隐私政策 | MD8AV',
  description: '了解我们如何收集、使用和保护您的个人信息',
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-5xl py-12">
      {/* Header */}
      <div className="mb-12 px-4">
        <h1 className="text-4xl font-bold mb-4">隐私政策</h1>
        <p className="text-muted-foreground">
          最后更新日期：2025年1月5日
        </p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">1. 信息收集</h2>
          <p className="mb-4 text-muted-foreground">
            我们收集以下类型的信息：
          </p>
          <ul className="space-y-3">
            <li className="flex gap-3">
              <span className="font-bold">•</span>
              <div>
                <strong className="text-foreground">自动收集的信息：</strong>
                <span className="text-muted-foreground">当您访问我们的网站时，我们会自动收集某些信息，包括您的IP地址、浏览器类型、访问时间和访问的页面。</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">•</span>
              <div>
                <strong className="text-foreground">Cookie和跟踪技术：</strong>
                <span className="text-muted-foreground">我们使用Cookie和类似技术来改善用户体验、分析网站流量和提供个性化内容。</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">•</span>
              <div>
                <strong className="text-foreground">分析数据：</strong>
                <span className="text-muted-foreground">我们使用第三方分析服务来了解用户如何使用我们的网站。</span>
              </div>
            </li>
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">2. 信息使用</h2>
          <p className="mb-4 text-muted-foreground">
            我们使用收集的信息用于：
          </p>
          <ul className="space-y-2">
            {['提供、维护和改进我们的服务', '分析网站使用情况和趋势', '个性化您的体验', '检测和防止欺诈或滥用行为', '遵守法律义务'].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">3. 广告</h2>
          <p className="text-muted-foreground">
            我们的网站可能显示第三方广告。这些广告服务商可能使用Cookie和其他技术来收集信息，以便向您展示相关广告。我们不控制这些第三方的隐私实践。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">4. 信息共享</h2>
          <p className="mb-4 text-muted-foreground">
            我们不会出售您的个人信息。我们可能与以下方共享信息：
          </p>
          <ul className="space-y-3">
            <li className="flex gap-3">
              <span className="font-bold">•</span>
              <div>
                <strong className="text-foreground">服务提供商：</strong>
                <span className="text-muted-foreground">帮助我们运营网站的第三方服务商</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">•</span>
              <div>
                <strong className="text-foreground">法律要求：</strong>
                <span className="text-muted-foreground">当法律要求或为保护我们的权利时</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">•</span>
              <div>
                <strong className="text-foreground">业务转让：</strong>
                <span className="text-muted-foreground">在合并、收购或资产出售的情况下</span>
              </div>
            </li>
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">5. 数据安全</h2>
          <p className="text-muted-foreground">
            我们采取合理的安全措施来保护您的信息免遭未经授权的访问、披露、更改或销毁。然而，没有互联网传输方法或电子存储方法是100%安全的。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">6. 您的权利</h2>
          <p className="mb-4 text-muted-foreground">
            根据适用法律，您可能拥有以下权利：
          </p>
          <ul className="space-y-2">
            {['访问我们持有的关于您的信息', '要求更正不准确的信息', '要求删除您的信息', '反对或限制某些处理活动', '数据可移植性'].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">7. Cookie政策</h2>
          <p className="mb-4 text-muted-foreground">
            我们使用Cookie来：
          </p>
          <ul className="space-y-2 mb-4">
            {['记住您的偏好和设置', '了解您如何使用我们的网站', '改善网站性能', '提供个性化内容和广告'].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            您可以通过浏览器设置管理Cookie偏好。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">8. 第三方链接</h2>
          <p className="text-muted-foreground">
            我们的网站可能包含指向第三方网站的链接。我们不对这些网站的隐私实践负责。我们建议您查看这些网站的隐私政策。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">9. 儿童隐私</h2>
          <p className="text-muted-foreground">
            我们的服务不面向18岁以下的儿童。我们不会故意收集18岁以下儿童的个人信息。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">10. 政策更新</h2>
          <p className="text-muted-foreground">
            我们可能会不时更新本隐私政策。我们将通过在本页面发布新的隐私政策来通知您任何更改。建议您定期查看本隐私政策。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">11. 联系我们</h2>
          <p className="mb-4 text-muted-foreground">
            如果您对本隐私政策有任何疑问，请通过Telegram联系我们：
          </p>
          <Link
            href={process.env.NEXT_PUBLIC_TELEGRAM_LINK || 'https://t.me/your_channel'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0088cc] hover:bg-[#0088cc]/90 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
            联系我们的Telegram
          </Link>
        </section>
      </div>
    </div>
  )
}
