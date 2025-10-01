export default function MainLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="max-w-[1000px] mx-auto">
      {children}
    </div>
  )
}
