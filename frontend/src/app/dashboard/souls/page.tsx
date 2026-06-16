'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Soul = { id: string; name: string; content: string; scope: string };

export default function SoulsPage() {
  const [templates, setTemplates] = useState<Soul[]>([]);
  const [companySouls, setCompanySouls] = useState<Soul[]>([]);
  const [mySouls, setMySouls] = useState<Soul[]>([]);
  const [editing, setEditing] = useState<Soul | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [scope, setScope] = useState<'personal' | 'company'>('personal');

  async function load() {
    const [t, c, m] = await Promise.all([
      api.get('/souls/templates'),
      api.get('/souls/company').catch(() => ({ data: [] })),
      api.get('/souls/mine'),
    ]);
    setTemplates(t.data);
    setCompanySouls(c.data);
    setMySouls(m.data);
  }

  useEffect(() => { load(); }, []);

  async function save(data: any) {
    if (editing) {
      await api.patch(`/souls/${editing.id}`, data);
    } else {
      await api.post('/souls', data);
    }
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Deletar este SOUL?')) return;
    await api.delete(`/souls/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">📝 SOULs</h1>
          <p className="text-gray-500 text-sm mt-1">
            O SOUL define a personalidade, tom e comportamento do agente. Use variáveis dinâmicas como{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{company.name}}'}</code> e{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{user.name}}'}</code>.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); setScope('personal'); }}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
        >
          + Novo SOUL
        </button>
      </div>

      {showForm && (
        <SoulForm
          soul={editing}
          scope={scope}
          setScope={setScope}
          onSave={save}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <Section title="🌐 Templates Globais" hint="Plataforma fornece — copie e personalize">
        {templates.map((s) => <SoulCard key={s.id} soul={s} readOnly />)}
      </Section>

      <Section title="🏢 SOULs da Empresa" hint="Definidos pelo admin da empresa">
        {companySouls.length === 0 ? <Empty msg="Nenhum SOUL de empresa" /> :
          companySouls.map((s) => (
            <SoulCard key={s.id} soul={s}
              onEdit={() => { setEditing(s); setShowForm(true); setScope('company'); }}
              onDelete={() => remove(s.id)} />
          ))}
      </Section>

      <Section title="👤 Meus SOULs" hint="Personalizados, só você usa">
        {mySouls.length === 0 ? <Empty msg="Crie um SOUL do zero ou copie um template" /> :
          mySouls.map((s) => (
            <SoulCard key={s.id} soul={s}
              onEdit={() => { setEditing(s); setShowForm(true); setScope('personal'); }}
              onDelete={() => remove(s.id)} />
          ))}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: any) {
  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-gray-500">{hint}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function SoulCard({ soul, onEdit, onDelete, readOnly }: any) {
  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold">{soul.name}</h3>
        {!readOnly && (
          <div className="flex gap-1">
            {onEdit && <button onClick={onEdit} className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">✏️</button>}
            <button onClick={onDelete} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded hover:bg-red-100">🗑️</button>
          </div>
        )}
        {readOnly && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">template</span>}
      </div>
      <pre className="text-xs bg-gray-50 p-3 rounded overflow-hidden max-h-48 whitespace-pre-wrap">
        {soul.content.slice(0, 500)}{soul.content.length > 500 ? '...' : ''}
      </pre>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="col-span-full p-6 text-center text-gray-400 bg-white border-2 border-dashed rounded-lg text-sm">{msg}</div>;
}

function SoulForm({ soul, scope, setScope, onSave, onCancel }: any) {
  const [name, setName] = useState(soul?.name ?? '');
  const [content, setContent] = useState(soul?.content ?? `# Meu SOUL

Você é um assistente da empresa {{company.name}}.

## Tom
{{company.tone}}

## Conhecimento
{{company.knowledge_base}}

## Regras
{{company.rules}}

Atende como: {{user.name}}`);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try { await onSave({ name, content, scope }); } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="mb-6 p-6 bg-white rounded-lg shadow border">
      <h3 className="font-semibold text-lg mb-4">{soul ? 'Editar' : 'Novo'} SOUL</h3>

      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Escopo</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === 'personal'} onChange={() => setScope('personal')} />
            <span className="text-sm">👤 Pessoal</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === 'company'} onChange={() => setScope('company')} />
            <span className="text-sm">🏢 Da empresa</span>
          </label>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Nome</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full p-2 border rounded" placeholder="Atendente Suporte" />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Conteúdo (Markdown)</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={14}
          className="w-full p-2 border rounded font-mono text-sm" />
        <p className="text-xs text-gray-500 mt-1">
          Variáveis: {'{{company.name}}'}, {'{{company.tone}}'}, {'{{company.knowledge_base}}'}, {'{{company.rules}}'}, {'{{user.name}}'}
        </p>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={submitting}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:opacity-50">
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">
          Cancelar
        </button>
      </div>
    </form>
  );
}
