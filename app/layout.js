import './globals.css'

export const metadata = {
  title: 'EryAI Dashboard',
  description: 'AI-driven kundtjänst dashboard',
}

export default function RootLayout({ children }) {
  return (
    <html lang="sv">
      <body className="min-h-screen bg-gray-50">
        {children}
      </body>
    </html>
  )
}
