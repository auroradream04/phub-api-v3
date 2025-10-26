import { Suspense } from 'react'
import EmbedsClient from './embeds-client'

export const metadata = {
  title: 'Embeds | Admin',
  description: 'Manage video embeds',
}

export default function EmbedsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Video Embeds</h1>
        <p className="text-muted-foreground mt-2">Create and manage embeddable video widgets</p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <EmbedsClient />
      </Suspense>
    </div>
  )
}
