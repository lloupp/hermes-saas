'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState('basic');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  function handleCompanyNameChange(v: string) {
    setCompanyName(v);
    if (!slug) {
      setSlug(v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const { data } = await api.post('/auth/register', {
        company_name: companyName,
        company_slug: slug,
        admin_name: adminName,
        admin_email: adminEmail,
        password,
        plan,
      });
      localStorage.setItem('token', data.access_token);
      router.push('/dashboard');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Erro ao registrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <form onSubmit={handleRegister} className="bg-white p-8 rounded-lg shadow-md w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-6">Criar Empresa no Hermes SaaS</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome da empresa</label>
            <input value={companyName} onChange={(e) => handleCompanyNameChange(e.target.value)} required
              className="w-full p-2 border rounded" placeholder="Petshop Dog" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Slug (URL)</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} required
              className="w-full p-2 border rounded bg-gray-50" placeholder="petshop-dog" />
            <p className="text-xs text-gray-500 mt-1">Será usado na URL do seu chat: {slug || 'slug'}.hermes-saas.com</p>
          </div>

          <hr />

          <div>
            <label className="block text-sm font-medium mb-1">Seu nome (admin)</label>
            <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required
              className="w-full p-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required
              className="w-full p-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Senha (mín 6 caracteres)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              className="w-full p-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Plano inicial</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'basic', label: 'Basic R$49/mês', sub: '$15 OpenRouter · 3 profiles' },
                { id: 'pro', label: 'Pro R$149/mês', sub: '$50 OpenRouter · ∞ profiles' },
                { id: 'enterprise', label: 'Enterprise R$499/mês', sub: '$200 OpenRouter · ∞' },
              ].map((p) => (
                <label key={p.id} className={`p-3 border rounded cursor-pointer text-center ${plan === p.id ? 'border-brand-600 bg-brand-50' : 'hover:border-gray-400'}`}>
                  <input type="radio" checked={plan === p.id} onChange={() => setPlan(p.id)} className="hidden" />
                  <div className="font-semibold text-sm">{p.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{p.sub}</div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {err && <div className="mt-4 text-red-600 text-sm bg-red-50 p-3 rounded">{err}</div>}

        <button type="submit" disabled={loading}
          className="mt-6 w-full bg-brand-600 text-white py-3 rounded hover:bg-brand-700 disabled:opacity-50">
          {loading ? 'Criando empresa...' : 'Criar empresa e entrar'}
        </button>

        <div className="mt-4 text-center text-sm">
          <a href="/login" className="text-brand-600 hover:underline">Já tem conta? Fazer login</a>
        </div>
      </form>
    </div>
  );
}
