import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function MainLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[800px] px-4 md:px-0">
      <Header />
      <main className="min-h-[calc(100vh-8rem)]">
        {children}
      </main>
      <Footer />
    </div>
  )
}
