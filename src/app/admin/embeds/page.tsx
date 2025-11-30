import { Suspense } from 'react'
import EmbedsClient from './embeds-client'

export const metadata = {
  title: 'Embeds | Admin',
  description: 'Manage video embeds',
}

export default function EmbedsPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Video Embeds</h1>
        <p className="text-zinc-500 mt-1">Create and manage embeddable video widgets</p>
      </div>

      <Suspense fallback={<div className="text-zinc-500">Loading...</div>}>
        <EmbedsClient />
      </Suspense>
    </div>
  )
}
