import type { Metadata } from 'next'
import Link from 'next/link'
import { Send } from 'lucide-react'

export const metadata: Metadata = {
  title: '服务条款 | MD8AV',
  description: '使用MD8AV服务的条款和条件',
}

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-5xl py-12">
      {/* Header */}
      <div className="mb-12 px-4">
        <h1 className="text-4xl font-bold mb-4">服务条款</h1>
        <p className="text-muted-foreground">
          最后更新日期：2025年1月5日
        </p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">1. 接受条款</h2>
          <p className="text-muted-foreground">
            欢迎使用MD8AV。通过访问或使用我们的网站，您同意受本服务条款的约束。如果您不同意这些条款，请不要使用我们的服务。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">2. 服务描述</h2>
          <p className="text-muted-foreground">
            MD8AV提供视频内容聚合和浏览服务。我们保留随时修改、暂停或终止服务的权利，恕不另行通知。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">3. 用户责任</h2>
          <p className="mb-4 text-muted-foreground">
            作为用户，您同意：
          </p>
          <ul className="space-y-2">
            {[
              '您已年满18岁或在您所在司法管辖区的法定成年年龄',
              '遵守所有适用的当地、州、国家和国际法律法规',
              '不使用服务进行任何非法或未经授权的目的',
              '不干扰或破坏服务或连接到服务的服务器或网络',
              '不尝试未经授权访问服务的任何部分',
              '不传播恶意软件、病毒或任何有害代码'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">4. 内容指南</h2>
          <p className="mb-4 text-muted-foreground">
            我们的平台仅供成人使用。所有内容必须符合以下准则：
          </p>
          <ul className="space-y-2">
            {[
              '不得包含未成年人的内容',
              '不得包含非法内容',
              '不得侵犯他人的知识产权',
              '不得包含暴力或极端内容'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">5. 知识产权</h2>
          <p className="text-muted-foreground">
            我们网站上的所有内容、特性和功能（包括但不限于所有信息、软件、文本、显示、图像、视频和音频，以及设计、选择和排列）均由MD8AV、其许可方或其他内容提供商拥有，并受中国和国际版权、商标、专利、商业秘密和其他知识产权或所有权法律的保护。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">6. 免责声明</h2>
          <p className="mb-4 text-muted-foreground">
            我们的服务按&ldquo;现状&rdquo;和&ldquo;可用&rdquo;基础提供。我们不作任何明示或暗示的保证，包括但不限于：
          </p>
          <ul className="space-y-2">
            {[
              '服务将不间断或无错误',
              '服务的结果将准确或可靠',
              '通过服务获得的任何信息的质量将满足您的期望',
              '服务中的任何错误将被纠正'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">7. 责任限制</h2>
          <p className="text-muted-foreground">
            在任何情况下，MD8AV、其董事、员工、合作伙伴、代理人、供应商或关联公司均不对任何间接、附带、特殊、后果性或惩罚性损害赔偿负责，包括但不限于利润损失、数据丢失、使用损失、商誉损失或其他无形损失。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">8. 赔偿</h2>
          <p className="mb-4 text-muted-foreground">
            您同意为MD8AV、其关联公司、高级职员、代理人、员工、合作伙伴和许可方辩护、赔偿并使其免受因以下原因引起的任何索赔、损害、义务、损失、责任、成本或债务以及费用（包括但不限于律师费）的损害：
          </p>
          <ul className="space-y-2">
            {[
              '您使用和访问服务',
              '您违反本条款的任何部分',
              '您侵犯任何第三方权利，包括但不限于任何版权、财产或隐私权'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">9. 第三方链接</h2>
          <p className="text-muted-foreground">
            我们的服务可能包含指向第三方网站或服务的链接。我们不控制这些第三方网站或服务的内容、隐私政策或做法，也不对其承担任何责任。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">10. 终止</h2>
          <p className="text-muted-foreground">
            我们可能在任何时候以任何理由终止或暂停您访问我们的服务，恕不另行通知或承担任何责任。所有适用于您的条款规定在终止后仍然有效。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">11. 适用法律</h2>
          <p className="text-muted-foreground">
            本条款应受中华人民共和国法律管辖并按其解释，不考虑其法律冲突条款。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">12. 条款变更</h2>
          <p className="text-muted-foreground">
            我们保留随时自行决定修改或替换这些条款的权利。如果修订是重大的，我们将尽合理努力提供至少30天的通知。您在这些修订生效后继续访问或使用我们的服务即表示您同意受修订条款的约束。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">13. 联系我们</h2>
          <p className="mb-4 text-muted-foreground">
            如果您对本服务条款有任何疑问，请通过Telegram联系我们：
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
