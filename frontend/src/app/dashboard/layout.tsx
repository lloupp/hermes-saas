export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 p-4">
        <h2 className="font-bold text-lg mb-6">Hermes SaaS</h2>
        <nav className="space-y-2">
          <a href="/dashboard" className="block px-3 py-2 rounded hover:bg-gray-100">📊 Visão Geral</a>
          <a href="/dashboard/profiles" className="block px-3 py-2 rounded hover:bg-gray-100">🤖 Profiles</a>
          <a href="/dashboard/skills" className="block px-3 py-2 rounded hover:bg-gray-100">⚡ Skills</a>
          <a href="/dashboard/souls" className="block px-3 py-2 rounded hover:bg-gray-100">📝 SOULs</a>
          <a href="/dashboard/clients" className="block px-3 py-2 rounded hover:bg-gray-100">👥 Clientes</a>
          <a href="/dashboard/users" className="block px-3 py-2 rounded hover:bg-gray-100">👤 Funcionários</a>
          <a href="/dashboard/chat" className="block px-3 py-2 rounded hover:bg-gray-100">💬 Chat</a>
          <div className="border-t mt-4 pt-4">
            <a href="/dashboard/settings" className="block px-3 py-2 rounded hover:bg-gray-100">⚙️ Configurações</a>
          </div>
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
