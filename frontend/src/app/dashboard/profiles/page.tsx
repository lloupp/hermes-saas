'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Profile = {
  id: string;
  name: string;
  model: string;
  soul_id?: string;
  custom_soul?: string;
  is_default: boolean;
};

type Soul = { id: string; name: string; content: string };
type Skill = { id: string; name: string; description?: string };

const MODELS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (rápido/barato)' },
  { id: 'openai/gpt-4o', label: 'GPT-4o (excelente)' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (rápido)' },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B (open source)' },
  { id: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
];

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [souls, setSouls] = useState<Soul[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [p, s, sk] = await Promise.all([
      api.get('/profiles'),
      api.get('/souls/mine'),
      api.get('/skills/mine'),
    ]);
    setProfiles(p.data);
    setSouls(s.data);
    setSkills(sk.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(data: any) {
    if (editing) {
      await api.patch(`/profiles/${editing.id}`, data);
    } else {
      await api.post('/profiles', data);
    }
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Deletar este profile?')) return;
    await api.delete(`/profiles/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">🤖 Meus Profiles</h1>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
        >
          + Novo Profile
        </button>
      </div>

      {showForm && (
        <ProfileForm
          profile={editing}
          souls={souls}
          skills={skills}
          onSave={save}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((p) => (
          <div key={p.id} className="p-5 bg-white rounded-lg shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-lg">{p.name}</h3>
              {p.is_default && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">padrão</span>}
            </div>
            <p className="text-sm text-gray-500 mb-3">🤖 {p.model}</p>
            <p className="text-xs text-gray-400 mb-4 truncate">
              SOUL: {p.custom_soul ? '(custom)' : p.soul_id ? `id ${p.soul_id.slice(0, 8)}` : '—'}
            </p>
            <div className="flex gap-2">
              <a href={`/dashboard/chat?profile=${p.id}`} className="text-sm bg-brand-50 text-brand-700 px-3 py-1 rounded hover:bg-brand-100">
                💬 Conversar
              </a>
              <button onClick={() => { setEditing(p); setShowForm(true); }} className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200">
                ✏️ Editar
              </button>
              <button onClick={() => remove(p.id)} className="text-sm bg-red-50 text-red-700 px-3 py-1 rounded hover:bg-red-100">
                🗑️
              </button>
            </div>
          </div>
        ))}
        {profiles.length === 0 && !showForm && (
          <div className="col-span-full p-12 text-center text-gray-400 bg-white border-2 border-dashed rounded-lg">
            Nenhum profile ainda. Crie o primeiro!
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileForm({ profile, souls, skills, onSave, onCancel }: any) {
  const [name, setName] = useState(profile?.name ?? '');
  const [model, setModel] = useState(profile?.model ?? 'openai/gpt-4o-mini');
  const [soulId, setSoulId] = useState(profile?.soul_id ?? '');
  const [customSoul, setCustomSoul] = useState(profile?.custom_soul ?? '');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave({
        name,
        model,
        soul_id: soulId || null,
        custom_soul: customSoul || null,
        skill_ids: selectedSkills,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 p-6 bg-white rounded-lg shadow border">
      <h3 className="font-semibold text-lg mb-4">{profile ? 'Editar' : 'Novo'} Profile</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nome</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full p-2 border rounded" placeholder="Ex: Atendente de Suporte"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Modelo LLM</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full p-2 border rounded">
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">SOUL (escolha um template OU escreva customizado)</label>
        <select
          value={soulId} onChange={(e) => { setSoulId(e.target.value); if (e.target.value) setCustomSoul(''); }}
          className="w-full p-2 border rounded mb-2"
        >
          <option value="">— Selecione um SOUL salvo —</option>
          {souls.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <textarea
          value={customSoul} onChange={(e) => { setCustomSoul(e.target.value); if (e.target.value) setSoulId(''); }}
          rows={8} className="w-full p-2 border rounded font-mono text-sm"
          placeholder="# SOUL.md\nVocê é um atendente...\n\nPode usar variáveis: {{company.name}}, {{user.name}}"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Skills habilitadas</label>
        <div className="grid grid-cols-2 gap-2">
          {skills.map((s) => (
            <label key={s.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selectedSkills.includes(s.id)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedSkills([...selectedSkills, s.id]);
                  else setSelectedSkills(selectedSkills.filter((x) => x !== s.id));
                }}
              />
              <span className="text-sm">{s.name}</span>
            </label>
          ))}
          {skills.length === 0 && <p className="text-sm text-gray-400 col-span-2">Nenhuma skill pessoal criada ainda.</p>}
        </div>
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
