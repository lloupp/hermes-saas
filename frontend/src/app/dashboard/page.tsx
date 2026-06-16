'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function DashboardPage() {
  const [overview, setOverview] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    api.get('/dashboard/overview').then((r) => setOverview(r.data)).catch(() => {});
  }, []);

  if (!overview) {
    return <div className="text-gray-500">Carregando...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Visão Geral (Super Admin)</h1>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Stat label="Empresas" value={overview.companies} />
        <Stat label="Usuários" value={overview.users} />
        <Stat label="Profiles" value={overview.profiles} />
        <Stat label="Clientes" value={overview.clients} />
        <Stat label="Interações" value={overview.interactions} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="text-3xl font-bold text-brand-600">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}
