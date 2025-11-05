import { Suspense } from 'react'
import EmbedsClient from './embeds-client'

export const metadata = {
  title: 'Embeds | Admin',
  description: 'Manage video embeds',
}

export default function EmbedsPage() {
  return (
    <div className="py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          Video Embeds
        </h1>
        <p className="text-muted-foreground mt-2">Create and manage embeddable video widgets</p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <EmbedsClient />
      </Suspense>
    </div>
  )
}
