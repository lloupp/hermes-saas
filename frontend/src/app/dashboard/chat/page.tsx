'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Msg = { role: 'user' | 'assistant'; content: string };
type Profile = { id: string; name: string; model: string };

function ChatInner() {
  const searchParams = useSearchParams();
  const initialProfile = searchParams.get('profile');

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>(initialProfile ?? '');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/login'; return; }

    fetch('/api/profiles', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((data) => {
        setProfiles(data);
        if (!activeProfileId && data.length) setActiveProfileId(data[0].id);
      }).catch((e) => setError(String(e)));

    fetch('/api/clients', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setClients).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeProfileId) loadHistory();
  }, [activeProfileId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadHistory() {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/chat/${activeProfileId}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const last = data[0];
    if (last?.messages) {
      setMessages(last.messages.map((m: any) => ({ role: m.role, content: m.content })));
    } else {
      setMessages([]);
    }
  }

  async function send() {
    if (!input.trim() || !activeProfileId || streaming) return;

    const userMsg: Msg = { role: 'user', content: input };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setStreaming(true);
    setError(null);

    const token = localStorage.getItem('token');
    const url = `/api/chat/${activeProfileId}${clientId ? `?client_id=${clientId}` : ''}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: userMsg.content, client_id: clientId || null }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      // Adiciona mensagem do assistant vazia que vai crescer
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages((m) => {
                const updated = [...m];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
      setMessages((m) => m.slice(0, -1)); // remove assistant vazia
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header com seletor de profile + cliente */}
      <div className="bg-white border-b p-4 flex gap-4 items-center">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mr-2">Profile:</label>
          <select
            value={activeProfileId} onChange={(e) => setActiveProfileId(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.model})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mr-2">Cliente (opcional):</label>
          <select
            value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">— anônimo —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-2 border-b text-sm">⚠️ {error}</div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">💬 Comece uma conversa</p>
            <p className="text-sm mt-2">Suas mensagens ficam salvas e vinculadas a este profile</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-3 rounded-lg ${
              m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white border shadow-sm'
            }`}>
              <div className="text-xs opacity-70 mb-1">{m.role === 'user' ? 'Você' : 'Agente'}</div>
              <div className="whitespace-pre-wrap">{m.content || (streaming && i === messages.length - 1 ? '...' : '')}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      <div className="bg-white border-t p-4">
        <div className="flex gap-2">
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Digite sua mensagem... (Enter envia, Shift+Enter quebra linha)"
            rows={2} disabled={streaming}
            className="flex-1 p-2 border rounded resize-none disabled:bg-gray-50"
          />
          <button onClick={send} disabled={streaming || !input.trim()}
            className="bg-brand-600 text-white px-6 py-2 rounded hover:bg-brand-700 disabled:opacity-50">
            {streaming ? '⏳' : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Carregando...</div>}>
      <ChatInner />
    </Suspense>
  );
}
