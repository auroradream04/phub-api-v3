export default function MainLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="px-4 md:px-6 lg:px-8">
      {children}
    </div>
  )
}
