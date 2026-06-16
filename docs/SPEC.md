# Hermes SaaS — Plataforma de Agentes Multi-tenant

## Visão Geral

Plataforma SaaS onde empresas se cadastram, adicionam funcionários, e cada funcionário pode criar múltiplos profiles de agente Hermes com SOULs e Skills customizáveis. Clientes das empresas conversam com os agentes via chat web. Admin global tem dashboard com visão de todas as empresas, funcionários, profiles e clientes.

---

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│                  Chat Web (Next.js)               │
│         Clientes conversam com o agente           │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              API Gateway (FastAPI)               │
│  Auth │ Multi-tenant │ Rate Limit │ Routing     │
└──────────┬───────────┬──────────────────────────┘
           │           │
     ┌─────▼─────┐ ┌───▼──────────┐
     │ PostgreSQL │ │  OpenRouter  │
     │  + RLS    │ │  (LLM proxy) │
     └───────────┘ └──────────────┘
```

---

## Entidades

### Admin Global
- Dono da plataforma
- Acessa dashboard com dados de TODAS as empresas
- Gerencia API keys do OpenRouter (cria, rotaciona, define budget)
- Cria templates de SOUL e Skills globais

### Empresa (Company)
- Paga assinatura por usuário/mês
- Tem uma OpenRouter API key vinculada (com budget limitado)
- Admin da empresa gerencia funcionários e conteúdos da empresa
- Define SOULs globais da empresa, Skills da empresa, knowledge base

### Funcionário (User)
- Pertence a uma empresa
- Role: `company_admin` ou `user`
- Cria seus próprios Profiles (quantos o plano permitir)
- Cria suas próprias Skills (por profile)
- Visualiza clientes da empresa

### Profile
- Criado pelo funcionário
- Tem: nome, modelo LLM, SOUL.md, skills habilitadas
- SOUL pode vir de: template global, SOUL da empresa, ou escrito do zero
- Skills podem ser: globais (plataforma), da empresa, ou pessoais

### Cliente (Client)
- Cadastrado pela empresa (CRM)
- Tem: nome, email, telefone, metadata customizável
- Conversas com o Hermes ficam vinculadas ao cliente

### Interação (Interaction)
- Cada conversa no chat web
- Vinculada a: empresa + funcionário + profile + cliente
- Armazena mensagens, tokens usados, timestamps

---

## Hierarquia de SOULs e Skills

```
Templates Globais (plataforma)     → disponível pra todos
    ↓ herda
SOULs da Empresa (admin cria)      → disponível pra todos da empresa
    ↓ herda
SOULs Pessoais (funcionário cria)  → só o funcionário usa

Mesma lógica pra Skills:
Skills Globais → Skills da Empresa → Skills Pessoais
```

Variáveis dinâmicas no SOUL:
- `{{company.name}}`, `{{company.tone}}`, `{{company.knowledge_base}}`
- `{{user.name}}`, `{{profile.name}}`

---

## Planos

| Plano | Preço/usuário/mês | Budget OpenRouter | Profiles | Modelos |
|-------|-------------------|-------------------|----------|---------|
| Basic | R$49 | $15 | 3 | modelos baratos (GPT-4o-mini, Llama) |
| Pro | R$149 | $50 | ilimitado | todos |
| Enterprise | R$499 | $200 | ilimitado | todos + fine-tuned |

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI (Python 3.12+) |
| Banco | PostgreSQL 16 + RLS (Row Level Security) |
| Auth | Supabase Auth (JWT, roles) |
| Frontend | Next.js 15 (App Router) + Tailwind |
| Chat UI | Chat engine custom (SSE para streaming) |
| LLM Proxy | OpenRouter API |
| Filas/Cache | Redis |
| Deploy | Docker Compose → Kubernetes |

---

## Modelos de Dados

Ver `docs/schema.sql` para o schema completo.

---

## Endpoints Principais (v1)

### Auth
- `POST /api/v1/auth/register` — registrar empresa + admin
- `POST /api/v1/auth/login` — login
- `POST /api/v1/auth/refresh` — refresh token

### Companies
- `GET /api/v1/companies` — admin global: lista todas
- `GET /api/v1/companies/{id}` — detalhe da empresa
- `GET /api/v1/companies/me` — empresa do usuário logado
- `PATCH /api/v1/companies/{id}` — atualizar

### Users
- `POST /api/v1/companies/{id}/users` — adicionar funcionário
- `GET /api/v1/companies/{id}/users` — listar funcionários
- `PATCH /api/v1/users/{id}` — atualizar
- `DELETE /api/v1/users/{id}` — remover

### Profiles
- `POST /api/v1/profiles` — criar profile
- `GET /api/v1/profiles` — listar meus profiles
- `GET /api/v1/profiles/{id}` — detalhe
- `PATCH /api/v1/profiles/{id}` — atualizar (SOUL, skills, modelo)
- `DELETE /api/v1/profiles/{id}` — deletar

### Skills
- `POST /api/v1/skills` — criar skill
- `GET /api/v1/skills/global` — templates globais
- `GET /api/v1/skills/company` — skills da empresa
- `GET /api/v1/skills/mine` — minhas skills
- `PATCH /api/v1/skills/{id}` — atualizar
- `DELETE /api/v1/skills/{id}` — deletar

### SOULs
- `GET /api/v1/souls/templates` — templates globais
- `GET /api/v1/souls/company` — SOULs da empresa
- `POST /api/v1/souls` — criar SOUL
- `PATCH /api/v1/souls/{id}` — atualizar

### Clients
- `POST /api/v1/clients` — cadastrar cliente
- `GET /api/v1/clients` — listar clientes da empresa
- `GET /api/v1/clients/{id}` — detalhe + histórico
- `PATCH /api/v1/clients/{id}` — atualizar

### Chat
- `POST /api/v1/chat/{profile_id}` — enviar mensagem (SSE stream)
- `GET /api/v1/chat/{profile_id}/history` — histórico

### Dashboard (Admin Global)
- `GET /api/v1/dashboard/overview` — resumo geral
- `GET /api/v1/dashboard/companies` — todas as empresas
- `GET /api/v1/dashboard/companies/{id}/users` — funcionários
- `GET /api/v1/dashboard/interactions` — todas as interações (filtros)
- `GET /api/v1/dashboard/budget` — uso de budget por empresa

---

## Fluxo de Chat

```
1. Cliente acessa chat web (URL única da empresa)
2. Cliente pode se identificar (email) ou ser anônimo
3. Sistema seleciona o profile padrão ou o cliente escolhe
4. Mensagem → API → busca SOUL do profile + skills + contexto da empresa
5. Monta prompt com variáveis dinâmicas resolvidas
6. Forwarda pro OpenRouter (key da empresa, modelo do profile)
7. Resposta em SSE (streaming)
8. Interação salva no banco (vinculada a cliente + profile)
9. Tokens descontados do budget da OpenRouter key
```

---

## Próximos Passos

1. Schema SQL completo
2. Backend FastAPI (auth + CRUD)
3. Frontend Next.js (dashboard + chat)
4. Integração OpenRouter
5. Deploy Docker Compose
