import { Suspense } from 'react'
import EmbedEditClient from './embed-edit-client'

export const metadata = {
  title: 'Edit Embed | Admin',
  description: 'Edit embed settings',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function EmbedEditPage({ params }: Props) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Edit Embed</h1>
        <p className="text-muted-foreground mt-2">Update embed settings and redirect URL</p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <EmbedEditClient embedId={id} />
      </Suspense>
    </div>
  )
}
