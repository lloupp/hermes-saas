'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Company = {
  id: string;
  name: string;
  slug: string;
  tone: string;
  knowledge_base: string;
  rules: string;
  has_openrouter_key: boolean;
  openrouter_budget_usd: number | null;
  is_active: boolean;
};

export default function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/companies/me');
      setCompany(data);
    } catch {
      window.location.href = '/login';
    }
  }

  useEffect(() => { load(); }, []);

  async function save(field: string, value: any, extra?: any) {
    setSaving(true); setMsg('');
    try {
      const payload: any = { [field]: value, ...(extra || {}) };
      const { data } = await api.patch('/companies/me', payload);
      setCompany(data);
      setMsg('Salvo');
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Erro');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  if (!company) return <div className="text-gray-500">Carregando...</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">⚙️ Configurações da Empresa</h1>
      <p className="text-gray-500 text-sm mb-8">
        Estas configurações alimentam todos os agents da empresa via variáveis dinâmicas nos SOULs.
      </p>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded text-sm ${msg === 'Salvo' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg}
        </div>
      )}

      <Section title="📛 Informações Gerais">
        <Field label="Nome da empresa">
          <input
            value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })}
            onBlur={() => save('name', company.name)}
            className="w-full p-2 border rounded"
          />
        </Field>
        <Field label="Slug (URL)">
          <input value={company.slug} disabled className="w-full p-2 border rounded bg-gray-50" />
        </Field>
      </Section>

      <Section title="🎭 Tom e Contexto (vai pra todos os SOULs)">
        <Field label="Tom padrão">
          <select
            value={company.tone} onChange={(e) => { setCompany({ ...company, tone: e.target.value }); save('tone', e.target.value); }}
            className="w-full p-2 border rounded"
          >
            <option value="profissional">Profissional</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
            <option value="amigavel">Amigável</option>
            <option value="tecnico">Técnico</option>
          </select>
        </Field>

        <Field label="Knowledge Base (será injetado nos SOULs como {{company.knowledge_base}})">
          <textarea
            value={company.knowledge_base}
            onChange={(e) => setCompany({ ...company, knowledge_base: e.target.value })}
            onBlur={() => save('knowledge_base', company.knowledge_base)}
            rows={8} className="w-full p-2 border rounded font-mono text-sm"
            placeholder="Liste produtos, FAQs, políticas da empresa..."
          />
        </Field>

        <Field label="Regras da empresa ({{company.rules}})">
          <textarea
            value={company.rules}
            onChange={(e) => setCompany({ ...company, rules: e.target.value })}
            onBlur={() => save('rules', company.rules)}
            rows={6} className="w-full p-2 border rounded font-mono text-sm"
            placeholder="Ex: nunca dar desconto acima de 10%, sempre oferecer..."
          />
        </Field>
      </Section>

      <Section title="🔑 OpenRouter API Key (da empresa)">
        <p className="text-sm text-gray-600 mb-3">
          Cada profile roda uma instância isolada do Hermes Agent usando esta key. Quando o budget acaba, profiles param de responder.
        </p>
        <Field label="Status atual">
          {company.has_openrouter_key ? (
            <span className="text-green-600 text-sm font-medium">✓ Key configurada</span>
          ) : (
            <span className="text-red-600 text-sm font-medium">✗ Nenhuma key cadastrada</span>
          )}
        </Field>
        <Field label={company.has_openrouter_key ? 'Atualizar key' : 'Cadastrar key'}>
          <div className="flex gap-2">
            <input
              type="password" value={openrouterKeyInput}
              onChange={(e) => setOpenrouterKeyInput(e.target.value)}
              placeholder="sk-or-v1-..." className="flex-1 p-2 border rounded"
            />
            <button
              onClick={() => { if (openrouterKeyInput.trim()) { save('openrouter_key', openrouterKeyInput.trim()); setOpenrouterKeyInput(''); } }}
              disabled={!openrouterKeyInput.trim() || saving}
              className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            💡 Crie uma key dedicada em openrouter.ai/keys com credit limit definido por mês.
          </p>
        </Field>
        <Field label="Budget mensal (USD)">
          <div className="flex gap-2">
            <input
              type="number" step="0.01"
              value={company.openrouter_budget_usd ?? ''}
              onChange={(e) => setCompany({ ...company, openrouter_budget_usd: e.target.value ? Number(e.target.value) : null })}
              className="flex-1 p-2 border rounded"
            />
            <button
              onClick={() => save('openrouter_budget_usd', company.openrouter_budget_usd)}
              className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
            >
              Salvar
            </button>
          </div>
        </Field>
      </Section>

      <Section title={`💡 Variáveis disponíveis nos SOULs`}>
        <div className="bg-gray-50 p-4 rounded border">
          <p className="text-sm text-gray-700 mb-2">Use estas variáveis em qualquer SOUL.md e elas serão preenchidas automaticamente:</p>
          <ul className="text-sm space-y-1 font-mono">
            <li><code className="text-brand-600">{'{{company.name}}'}</code> → <code>{company.name}</code></li>
            <li><code className="text-brand-600">{'{{company.tone}}'}</code> → <code>{company.tone}</code></li>
            <li><code className="text-brand-600">{'{{company.knowledge_base}}'}</code> → <code>{company.knowledge_base.slice(0, 80)}{company.knowledge_base.length > 80 ? '...' : ''}</code></li>
            <li><code className="text-brand-600">{'{{company.rules}}'}</code> → <code>{company.rules.slice(0, 80)}{company.rules.length > 80 ? '...' : ''}</code></li>
          </ul>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="mb-8 p-6 bg-white rounded-lg shadow-sm border border-gray-100">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700">{label}</label>
      {children}
    </div>
  );
}
