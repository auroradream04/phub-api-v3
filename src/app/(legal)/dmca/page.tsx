import type { Metadata } from 'next'
import Link from 'next/link'
import { Send } from 'lucide-react'

export const metadata: Metadata = {
  title: 'DMCA政策 | MD8AV',
  description: '数字千年版权法案合规政策和版权投诉流程',
}

export default function DMCAPage() {
  return (
    <div className="container mx-auto max-w-5xl py-12">
      {/* Header */}
      <div className="mb-12 px-4">
        <h1 className="text-4xl font-bold mb-4">DMCA政策</h1>
        <p className="text-muted-foreground">
          最后更新日期：2025年1月5日
        </p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">1. DMCA合规</h2>
          <p className="text-muted-foreground">
            MD8AV尊重他人的知识产权，并期望我们的用户也这样做。根据《数字千年版权法案》（DMCA）第512(c)条的规定，如果我们收到适当的通知，表明用户发布或存储在我们服务上的材料侵犯了他人的版权，我们将迅速删除或禁用对涉嫌侵权材料的访问。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">2. 版权侵权通知</h2>
          <p className="mb-4 text-muted-foreground">
            如果您认为您的版权作品被以构成侵权的方式复制，请向我们的DMCA代理提供以下信息：
          </p>
          <ul className="space-y-2">
            {[
              '您被授权代表版权所有者行事的电子或物理签名',
              '对您声称已被侵权的版权作品的描述',
              '对您声称侵权的材料在我们网站上的位置的描述（URL）',
              '您的地址、电话号码和联系方式',
              '您的声明，表示您善意相信争议使用未经版权所有者、其代理或法律授权',
              '您在伪证处罚下作出的声明，表明您通知中的上述信息准确无误，并且您是版权所有者或被授权代表版权所有者行事'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">3. 如何提交DMCA通知</h2>
          <p className="mb-4 text-muted-foreground">
            请通过以下方式向我们的指定代理提交DMCA通知：
          </p>
          <div className="bg-muted/50 border border-border p-6 rounded-lg mb-4">
            <p className="mb-2"><strong className="text-foreground">DMCA代理</strong></p>
            <p className="mb-2 text-muted-foreground">MD8AV</p>
            <p className="text-muted-foreground">通过Telegram联系</p>
          </div>
          <p className="text-muted-foreground">
            请注意，根据DMCA第512(f)条，任何人故意在删除通知中作出重大虚假陈述，声称材料或活动构成侵权，可能需要承担责任。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">4. 反通知程序</h2>
          <p className="mb-4 text-muted-foreground">
            如果您认为由于错误或误认而删除或禁用了您的内容，您可以向我们的DMCA代理发送反通知。反通知必须包括以下内容：
          </p>
          <ul className="space-y-2">
            {[
              '您的物理或电子签名',
              '对已删除或禁用访问的材料的描述，以及该材料在删除或禁用访问之前出现的位置',
              '您在伪证处罚下作出的声明，表明您善意相信材料是由于错误或误认而被删除或禁用的',
              '您的姓名、地址和电话号码',
              '声明您同意您所在地司法区联邦地区法院的管辖权，或如果您的地址在美国境外，同意MD8AV所在地任何司法区的管辖权',
              '声明您将接受提供原始侵权通知的一方或该方代理的送达'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">5. 重复侵权者政策</h2>
          <p className="text-muted-foreground">
            根据适用法律的要求，MD8AV采取了在适当情况下终止被确定为重复侵权者的用户帐户的政策。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">6. 误用DMCA流程</h2>
          <p className="mb-4 text-muted-foreground">
            DMCA流程仅用于报告版权侵权。不得将其用于其他目的，例如：
          </p>
          <ul className="space-y-2 mb-4">
            {[
              '骚扰或审查合法内容',
              '删除您不喜欢的内容',
              '删除竞争对手的内容',
              '报告商标问题（请使用适当的商标投诉流程）'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            误用DMCA流程可能会导致法律后果，包括根据DMCA第512(f)条承担损害赔偿责任。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">7. 处理时间</h2>
          <p className="mb-4 text-muted-foreground">
            我们致力于及时处理所有有效的DMCA通知。一旦我们收到符合上述要求的完整通知，我们将：
          </p>
          <ul className="space-y-2">
            {[
              '在1-3个工作日内确认收到您的通知',
              '调查索赔',
              '如果适当，删除或禁用对涉嫌侵权材料的访问',
              '通知上传者已删除或禁用内容'
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="font-bold">•</span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">8. 其他知识产权问题</h2>
          <p className="text-muted-foreground">
            虽然本政策专门针对DMCA版权问题，但我们也尊重其他形式的知识产权。如果您对商标、专利或其他知识产权有疑问，请通过Telegram联系我们。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">9. 免责声明</h2>
          <p className="text-muted-foreground">
            本DMCA政策中的信息仅供一般参考。它不构成法律建议。如果您对版权法或DMCA流程有疑问，我们建议您咨询合格的律师。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">10. 政策更新</h2>
          <p className="text-muted-foreground">
            我们可能会不时更新本DMCA政策。任何更改将在本页面上发布，并注明&ldquo;最后更新&rdquo;日期。
          </p>
        </section>

        <section className="bg-card border border-border p-6">
          <h2 className="text-2xl font-semibold mb-4">11. 联系信息</h2>
          <p className="mb-4 text-muted-foreground">
            如果您对本DMCA政策有任何疑问或需要提交DMCA通知，请通过Telegram联系我们：
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
