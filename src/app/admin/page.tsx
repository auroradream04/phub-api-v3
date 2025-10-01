'use client'

import { useSession } from 'next-auth/react'

export default function AdminDashboard() {
  const { data: session } = useSession()

  return (
    <div className="px-4 sm:px-0">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Dashboard
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-gray-700">
          Welcome back, {session?.user?.name || session?.user?.email}!
        </p>
        <p className="text-gray-500 mt-2">
          This is your admin dashboard. Use the navigation above to manage ads.
        </p>
      </div>
    </div>
  )
}