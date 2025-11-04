import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '用户认证 - MD8AV',
  description: 'MD8AV用户登录和注册页面。访问您的账户以管理视频内容和个人设置。',
  keywords: ['登录', '注册', '用户认证', 'MD8AV账户', '用户管理'],
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
