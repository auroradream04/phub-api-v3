'use client'

import { useState } from 'react'
import { Copy, CheckCircle } from 'lucide-react'

export function CopyButton({ text }: { text: string; id: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-2 hover:bg-muted rounded-lg transition-colors inline-flex items-center gap-1"
      title="复制到剪贴板"
    >
      {copied ? (
        <>
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-500">已复制</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">复制</span>
        </>
      )}
    </button>
  )
}
