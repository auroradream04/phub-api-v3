'use client'

import Link from 'next/link'
import { ChevronRight, AlertCircle, CheckCircle, Copy } from 'lucide-react'
import { useState } from 'react'

export default function MacCMSGuide() {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const apiUrl = 'https://your-domain.com/api/maccms/api.php/provide/vod/at/xml'
  const jsonUrl = 'https://your-domain.com/api/maccms/api.php/provide/vod'

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/" className="text-2xl font-bold text-primary">
                视频中心
              </Link>
              <nav className="hidden md:flex space-x-6">
                <Link href="/" className="text-foreground/80 hover:text-primary transition-colors">
                  首页
                </Link>
                <Link href="/trending" className="text-foreground/80 hover:text-primary transition-colors">
                  热门
                </Link>
                <Link href="/categories" className="text-foreground/80 hover:text-primary transition-colors">
                  分类
                </Link>
                <Link href="/docs" className="text-foreground/80 hover:text-primary transition-colors font-medium">
                  文档
                </Link>
              </nav>
            </div>
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              管理后台
            </Link>
          </div>
        </div>
      </header>

      <div className="space-y-12 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/docs" className="hover:text-primary transition-colors">
            文档
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium">MacCMS 集成指南</span>
        </div>

        {/* Header */}
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-900/20 border border-blue-600/30">
            <span className="text-lg font-bold text-blue-500">MC</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground">
            MacCMS (苹果CMS) 集成指南
          </h1>
          <p className="text-lg text-muted-foreground">
            本指南将帮助您快速将我们的API集合接入到MacCMS系统，支持M3U8在线播放和下载资源的采集。
          </p>
        </div>

        {/* Quick Info */}
        <div className="bg-blue-900/10 border border-blue-600/30 rounded-xl p-6 flex gap-4">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground mb-1">预计时间：5-10 分钟</p>
            <p className="text-sm text-muted-foreground">
              整个集成过程很简单，只需配置一个API源即可开始使用。
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-8">
          {/* Step 1 */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                1
              </div>
              <h2 className="text-2xl font-bold text-foreground">登录 MacCMS 管理后台</h2>
            </div>
            <div className="ml-14 space-y-3">
              <p className="text-muted-foreground">
                打开您的 MacCMS 系统管理后台，通常地址为：
              </p>
              <div className="bg-card border border-border rounded-lg p-4 font-mono text-sm text-foreground break-all">
                http://your-maccms-domain.com/admin/
              </div>
              <p className="text-sm text-muted-foreground">
                使用您的管理员账号和密码登录。
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                2
              </div>
              <h2 className="text-2xl font-bold text-foreground">进入采集配置</h2>
            </div>
            <div className="ml-14 space-y-3">
              <p className="text-muted-foreground">
                在管理后台左侧菜单中找到并点击：
              </p>
              <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-2">
                <span className="text-foreground font-semibold">采集管理</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground font-semibold">采集配置</span>
              </div>
              <p className="text-sm text-muted-foreground">
                或直接访问：<code className="bg-muted px-2 py-1 rounded text-foreground">/admin/?m=api_collec</code>
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                3
              </div>
              <h2 className="text-2xl font-bold text-foreground">添加新的采集源</h2>
            </div>
            <div className="ml-14 space-y-3">
              <p className="text-muted-foreground">
                在采集配置页面中，点击&quot;添加采集源&quot;或&quot;新增&quot;按钮。
              </p>
              <div className="bg-muted/50 border border-border rounded-lg p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">采集源名称</label>
                  <input
                    type="text"
                    value="我们的视频资源"
                    readOnly
                    className="w-full px-4 py-2 bg-card border border-border rounded-lg text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">采集源URL (XML格式)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={apiUrl}
                      readOnly
                      className="flex-1 px-4 py-2 bg-card border border-border rounded-lg text-foreground text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(apiUrl, 'xml-url')}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                    >
                      {copied === 'xml-url' ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          复制
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">采集源URL (JSON格式)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={jsonUrl}
                      readOnly
                      className="flex-1 px-4 py-2 bg-card border border-border rounded-lg text-foreground text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(jsonUrl, 'json-url')}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                    >
                      {copied === 'json-url' ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          复制
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>提示：</strong> 请将上面的 <code className="bg-muted px-2 py-1 rounded">your-domain.com</code> 替换为您实际的服务器域名或IP地址。
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                4
              </div>
              <h2 className="text-2xl font-bold text-foreground">配置采集参数</h2>
            </div>
            <div className="ml-14 space-y-3">
              <p className="text-muted-foreground">
                在采集配置表单中，根据您的需求设置以下参数：
              </p>
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div>
                  <p className="font-semibold text-foreground mb-1">采集分类字段映射</p>
                  <p className="text-sm text-muted-foreground">
                    保持默认设置即可。系统会自动识别我们API返回的分类。
                  </p>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="font-semibold text-foreground mb-1">采集点数 (可选)</p>
                  <p className="text-sm text-muted-foreground">
                    如果需要限制采集数量，可以在这里设置。建议保持为空以获取所有内容。
                  </p>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="font-semibold text-foreground mb-1">采集频率</p>
                  <p className="text-sm text-muted-foreground">
                    建议设置为每天采集一次，以获取最新内容。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                5
              </div>
              <h2 className="text-2xl font-bold text-foreground">测试并保存</h2>
            </div>
            <div className="ml-14 space-y-3">
              <p className="text-muted-foreground">
                在保存前，建议先测试连接：
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">点击&quot;测试&quot;按钮验证API连接</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">确认没有错误提示</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">点击&quot;保存&quot;按钮保存配置</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Step 6 */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                6
              </div>
              <h2 className="text-2xl font-bold text-foreground">开始采集</h2>
            </div>
            <div className="ml-14 space-y-3">
              <p className="text-muted-foreground">
                保存配置后，您可以开始采集：
              </p>
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <p className="text-foreground font-semibold">自动采集：</p>
                <p className="text-sm text-muted-foreground ml-4">
                  系统将按照设置的频率自动采集内容。
                </p>
                <p className="text-foreground font-semibold mt-4">手动采集：</p>
                <p className="text-sm text-muted-foreground ml-4">
                  在采集列表中点击该采集源旁的&quot;采集&quot;按钮，可以立即开始采集。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="space-y-6 pt-8 border-t border-border">
          <h2 className="text-2xl font-bold text-foreground">常见问题解决</h2>

          <div className="space-y-4">
            {[
              {
                q: '如何获取我的API URL？',
                a: '您的API URL应该是：https://your-domain.com/api/maccms/api.php/provide/vod/at/xml 请将 your-domain.com 替换为您实际的域名或服务器地址。'
              },
              {
                q: '测试连接失败，显示&quot;无法连接&quot;？',
                a: '请检查：1) 域名或IP地址是否正确；2) 防火墙是否允许该端口的访问；3) 网络连接是否正常。'
              },
              {
                q: '采集后没有显示视频怎么办？',
                a: '请检查：1) 采集任务是否完成；2) 数据库中是否有新的视频记录；3) 分类映射是否正确。'
              },
              {
                q: '可以采集多少个视频？',
                a: '没有限制。我们的API支持无限采集。采集速度取决于您的网络连接和服务器性能。'
              },
              {
                q: '采集的视频可以离线观看吗？',
                a: '是的，视频数据存储在您的MacCMS系统中。用户可以在线观看或下载（如果您在MacCMS中启用了此功能）。'
              }
            ].map((item, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-all">
                <p className="font-semibold text-foreground mb-2">{item.q}</p>
                <p className="text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Support */}
        <div className="bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-8 text-center">
          <h3 className="text-xl font-bold text-foreground mb-2">集成完成！</h3>
          <p className="text-muted-foreground mb-4">
            恭喜，您已成功配置MacCMS与我们的API集合。现在您可以开始采集和播放高清视频了。
          </p>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            返回文档首页
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
