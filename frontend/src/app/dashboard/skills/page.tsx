'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Skill = {
  id: string;
  name: string;
  description?: string;
  content: string;
  scope: string;
};

export default function SkillsPage() {
  const [templates, setTemplates] = useState<Skill[]>([]);
  const [companySkills, setCompanySkills] = useState<Skill[]>([]);
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [scope, setScope] = useState<'personal' | 'company'>('personal');

  async function load() {
    const [t, c, m] = await Promise.all([
      api.get('/skills/templates'),
      api.get('/skills/company').catch(() => ({ data: [] })),
      api.get('/skills/mine'),
    ]);
    setTemplates(t.data);
    setCompanySkills(c.data);
    setMySkills(m.data);
  }

  useEffect(() => { load(); }, []);

  async function save(data: any) {
    if (editing) {
      await api.patch(`/skills/${editing.id}`, data);
    } else {
      await api.post('/skills', data);
    }
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Deletar esta skill?')) return;
    await api.delete(`/skills/${id}`);
    load();
  }

  async function toggle(s: Skill) {
    // Para templates, vamos só mostrar — não dá pra editar
    // Para skills pessoais/empresa, toggle via update (futuro: PATCH individual)
    alert('Implementar toggle enabled no backend');
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">⚡ Skills</h1>
        <button
          onClick={() => { setEditing(null); setShowForm(true); setScope('personal'); }}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
        >
          + Nova Skill
        </button>
      </div>

      {showForm && (
        <SkillForm
          skill={editing}
          scope={scope}
          setScope={setScope}
          onSave={save}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <Section title="🌐 Templates Globais (plataforma)" hint="Disponíveis em todos os profiles">
        {templates.map((s) => (
          <SkillCard key={s.id} skill={s} readOnly onDelete={() => toggle(s)} />
        ))}
      </Section>

      <Section title="🏢 Skills da Empresa (admin)" hint="Visível para todos os funcionários">
        {companySkills.length === 0 ? (
          <Empty msg="Nenhuma skill da empresa ainda" />
        ) : companySkills.map((s) => (
          <SkillCard key={s.id} skill={s} onDelete={() => remove(s.id)} onEdit={() => { setEditing(s); setShowForm(true); setScope('company'); }} />
        ))}
      </Section>

      <Section title="👤 Minhas Skills (pessoais)" hint="Só você usa">
        {mySkills.length === 0 ? (
          <Empty msg="Crie sua primeira skill pessoal" />
        ) : mySkills.map((s) => (
          <SkillCard key={s.id} skill={s} onDelete={() => remove(s.id)} onEdit={() => { setEditing(s); setShowForm(true); setScope('personal'); }} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: any) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-gray-500">{hint}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.filter(Boolean).length === 0 ? <Empty msg="—" /> : items}
      </div>
    </div>
  );
}

function SkillCard({ skill, onEdit, onDelete, readOnly }: any) {
  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold">{skill.name}</h3>
          <p className="text-sm text-gray-500">{skill.description}</p>
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            {onEdit && <button onClick={onEdit} className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">✏️</button>}
            <button onClick={onDelete} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded hover:bg-red-100">🗑️</button>
          </div>
        )}
        {readOnly && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">global</span>}
      </div>
      <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-hidden text-ellipsis whitespace-pre-wrap max-h-24">
        {skill.content.slice(0, 200)}{skill.content.length > 200 ? '...' : ''}
      </pre>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="col-span-full p-6 text-center text-gray-400 bg-white border-2 border-dashed rounded-lg text-sm">
      {msg}
    </div>
  );
}

function SkillForm({ skill, scope, setScope, onSave, onCancel }: any) {
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [content, setContent] = useState(skill?.content ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave({ name, description, content, scope });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 p-6 bg-white rounded-lg shadow border">
      <h3 className="font-semibold text-lg mb-4">{skill ? 'Editar' : 'Nova'} Skill</h3>

      <div className="mb-2">
        <label className="block text-sm font-medium mb-1">Escopo</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === 'personal'} onChange={() => setScope('personal')} />
            <span className="text-sm">👤 Pessoal (só eu)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === 'company'} onChange={() => setScope('company')} />
            <span className="text-sm">🏢 Da empresa (todos os funcionários)</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="block text-sm font-medium mb-1">Nome (lowercase, hyphens)</label>
          <input
            value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} required
            className="w-full p-2 border rounded" placeholder="web-search"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Descrição</label>
          <input
            value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2 border rounded" placeholder="Busca informações na web"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Conteúdo (SKILL.md)</label>
        <textarea
          value={content} onChange={(e) => setContent(e.target.value)} required rows={10}
          className="w-full p-2 border rounded font-mono text-sm"
          placeholder={`---\nname: minha-skill\ndescription: O que essa skill faz\n---\n\n# Minha Skill\n\n## Quando usar\n...`}
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:opacity-50">
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">
          Cancelar
        </button>
      </div>
    </form>
  );
}
