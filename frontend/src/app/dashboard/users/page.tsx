'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

type User = { id: string; email: string; name: string; role: string; is_active: boolean };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  async function load() {
    const { data } = await api.get('/users');
    setUsers(data);
  }

  useEffect(() => { load(); }, []);

  async function save(data: any) {
    if (editing) {
      await api.patch(`/users/${editing.id}`, data);
    } else {
      await api.post('/users', data);
    }
    setShowForm(false); setEditing(null); load();
  }

  async function toggleActive(u: User) {
    await api.patch(`/users/${u.id}`, { is_active: !u.is_active });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Remover este funcionário?')) return;
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Erro');
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">👤 Funcionários</h1>
          <p className="text-gray-500 text-sm mt-1">Apenas admins podem adicionar/remover funcionários</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700">
          + Adicionar Funcionário
        </button>
      </div>

      {showForm && <UserForm user={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null); }} />}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Email</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Role</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Status</th>
              <th className="text-right px-4 py-3 text-sm font-semibold text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                <td className="px-4 py-3 text-sm">
                  {u.role === 'company_admin' ?
                    <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-medium">admin</span> :
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs">user</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.is_active ?
                    <span className="text-green-600">● ativo</span> :
                    <span className="text-red-600">● inativo</span>}
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button onClick={() => toggleActive(u)}
                    className="text-sm bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">
                    {u.is_active ? 'desativar' : 'ativar'}
                  </button>
                  <button onClick={() => remove(u.id)}
                    className="text-sm bg-red-50 text-red-700 px-2 py-1 rounded hover:bg-red-100">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-12 text-center text-gray-400">Nenhum funcionário</div>}
      </div>
    </div>
  );
}

function UserForm({ user, onSave, onCancel }: any) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role ?? 'user');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data: any = user ? { name, role } : { name, email, password, role };
      await onSave(data);
    } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="mb-6 p-6 bg-white rounded-lg shadow border">
      <h3 className="font-semibold text-lg mb-4">{user ? 'Editar' : 'Adicionar'} Funcionário</h3>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div><label className="block text-sm font-medium mb-1">Nome *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-2 border rounded" /></div>
        <div><label className="block text-sm font-medium mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-2 border rounded">
            <option value="user">👤 User (cria profiles)</option>
            <option value="company_admin">🏢 Company Admin (gerencia tudo)</option>
          </select>
        </div>
        {!user && <>
          <div><label className="block text-sm font-medium mb-1">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-2 border rounded" /></div>
          <div><label className="block text-sm font-medium mb-1">Senha *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full p-2 border rounded" /></div>
        </>}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:opacity-50">
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Cancelar</button>
      </div>
    </form>
  );
}
