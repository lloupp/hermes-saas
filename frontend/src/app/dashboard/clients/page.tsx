'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  metadata?: Record<string, any>;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    const { data } = await api.get('/clients');
    setClients(data);
  }

  useEffect(() => { load(); }, []);

  async function save(data: any) {
    if (editing) {
      await api.patch(`/clients/${editing.id}`, data);
    } else {
      await api.post('/clients', data);
    }
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Deletar este cliente?')) return;
    await api.delete(`/clients/${id}`);
    load();
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">👥 Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">CRM da empresa — todas as interações no chat ficam vinculadas</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700">
          + Novo Cliente
        </button>
      </div>

      {showForm && <ClientForm client={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null); }} />}

      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Buscar..." className="w-full max-w-md p-2 border rounded mb-4" />

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Email</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Telefone</th>
              <th className="text-right px-4 py-3 text-sm font-semibold text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { setEditing(c); setShowForm(true); }}
                    className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 mr-1">✏️</button>
                  <button onClick={() => remove(c.id)}
                    className="text-sm bg-red-50 text-red-700 px-3 py-1 rounded hover:bg-red-100">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-gray-400">Nenhum cliente</div>
        )}
      </div>
    </div>
  );
}

function ClientForm({ client, onSave, onCancel }: any) {
  const [name, setName] = useState(client?.name ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [metadata, setMetadata] = useState(JSON.stringify(client?.metadata ?? {}, null, 2));
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let meta: any = {};
      try { meta = JSON.parse(metadata); } catch { alert('JSON inválido nos metadados'); setSubmitting(false); return; }
      await onSave({ name, email, phone, metadata: meta });
    } catch (err) { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="mb-6 p-6 bg-white rounded-lg shadow border">
      <h3 className="font-semibold text-lg mb-4">{client ? 'Editar' : 'Novo'} Cliente</h3>
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div><label className="block text-sm font-medium mb-1">Nome *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-2 border rounded" /></div>
        <div><label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 border rounded" /></div>
        <div><label className="block text-sm font-medium mb-1">Telefone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2 border rounded" /></div>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Metadata (JSON)</label>
        <textarea value={metadata} onChange={(e) => setMetadata(e.target.value)} rows={4}
          className="w-full p-2 border rounded font-mono text-sm" placeholder='{"cpf": "...", "plano": "pro"}' />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:opacity-50">
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Cancelar</button>
      </div>
    </form>
  );
}
