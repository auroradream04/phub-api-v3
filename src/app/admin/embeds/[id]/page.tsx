import { Suspense } from 'react'
import EmbedDetailClient from './embed-detail-client'

export const metadata = {
  title: 'Embed Details | Admin',
  description: 'View embed details and analytics',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function EmbedDetailPage({ params }: Props) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Embed Details</h1>
        <p className="text-muted-foreground mt-2">View analytics and manage embed settings</p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <EmbedDetailClient embedId={id} />
      </Suspense>
    </div>
  )
}
