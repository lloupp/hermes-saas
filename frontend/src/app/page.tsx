export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-50 to-white">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Hermes SaaS
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Plataforma multi-tenant de agentes Hermes
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 bg-white rounded-lg shadow">
            <h3 className="font-semibold text-lg mb-2">📊 Dashboard Admin</h3>
            <p className="text-gray-600">Visão global de todas as empresas</p>
          </div>
          <div className="p-6 bg-white rounded-lg shadow">
            <h3 className="font-semibold text-lg mb-2">👥 Multi-tenant</h3>
            <p className="text-gray-600">Empresas isoladas com RLS</p>
          </div>
          <div className="p-6 bg-white rounded-lg shadow">
            <h3 className="font-semibold text-lg mb-2">🤖 Agentes SOUL</h3>
            <p className="text-gray-600">Profiles com OpenRouter</p>
          </div>
        </div>
        <div className="mt-12">
          <a
            href="/dashboard"
            className="inline-block bg-brand-600 text-white px-6 py-3 rounded-lg hover:bg-brand-700"
          >
            Entrar no Dashboard →
          </a>
        </div>
      </div>
    </main>
  );
}
