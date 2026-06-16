# Hermes SaaS — Plataforma Multi-tenant de Agentes Hermes

Plataforma SaaS onde empresas se cadastram, adicionam funcionários, e cada funcionário pode criar **múltiplos profiles de agente Hermes** com **SOULs e Skills customizáveis**. Clientes das empresas conversam com os agentes via chat web. O **super admin** tem dashboard com visão global.

## 🎯 Funcionalidades

- **Multi-tenant** com PostgreSQL Row Level Security (isolamento total por empresa)
- **3 níveis de SOUL/Skills**: templates globais, da empresa, pessoais
- **Variáveis dinâmicas** no SOUL (`{{company.name}}`, `{{user.name}}`, etc.)
- **CRUD de Profiles** com seleção de modelo OpenRouter
- **Chat web SSE streaming** via OpenRouter
- **Dashboard Super Admin**: visão global de empresas, usuários, profiles, clients, budget
- **CRM embutido**: cadastro de clientes por empresa
- **Três níveis de plano**: Basic / Pro / Enterprise
- **API proxy** com keys OpenRouter por empresa (controle de budget individual)

## 🏗️ Arquitetura

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Chat Web    │────▶│  FastAPI     │────▶│  OpenRouter  │
│  Next.js     │     │  (multi-      │     │  (LLM)       │
│              │     │   tenant)    │     └──────────────┘
└──────────────┘     └──────┬───────┘            ▲
                            │                    │
                            ▼                    │
                     ┌──────────────┐            │
                     │  PostgreSQL  │            │
                     │  + RLS       │            │
                     └──────────────┘            │
                                                 │
   Admin Da Empresa define key OpenRouter ──────┘
   que controla qual modelo é chamado e quanto
   cada empresa pode gastar
```

## 📁 Estrutura

```
hermes-saas/
├── backend/             # FastAPI
│   ├── app/
│   │   ├── api/v1/      # Rotas REST
│   │   ├── core/        # Config, DB, security
│   │   ├── models/      # SQLAlchemy
│   │   └── services/    # OpenRouter proxy
│   ├── main.py
│   └── pyproject.toml
├── frontend/            # Next.js 15
│   ├── src/
│   │   ├── app/         # App Router
│   │   └── lib/
│   └── package.json
├── docs/
│   ├── SPEC.md          # Especificação completa
│   └── schema.sql       # Schema PostgreSQL
├── docker-compose.yml
└── README.md
```

## 🚀 Quick Start

### Via Docker (recomendado)
```bash
docker-compose up --build
```
- Frontend: http://localhost:3000
- Backend:  http://localhost:8000/docs

### Manual
```bash
# Backend
cd backend
pip install -e .
python main.py

# Frontend (outro terminal)
cd frontend
npm install
npm run dev

# Database
psql -U hermes -d hermes_saas -f docs/schema.sql
```

## 📡 Endpoints Principais

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/v1/auth/register` | Registrar empresa + admin |
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/profiles` | Listar meus profiles |
| POST | `/api/v1/profiles` | Criar profile |
| POST | `/api/v1/chat/{profile_id}` | Chat SSE streaming |
| GET | `/api/v1/skills/templates` | Templates globais de skill |
| POST | `/api/v1/skills` | Criar skill |
| GET | `/api/v1/souls/templates` | Templates globais de SOUL |
| POST | `/api/v1/souls` | Criar SOUL |
| GET | `/api/v1/clients` | Listar clientes |
| GET | `/api/v1/dashboard/overview` | Stats global (super admin) |

## 🔐 Hierarquia de Acesso

- **super_admin** — vê tudo (dashboard global)
- **company_admin** — gerencia funcionários, SOULs/Skills da empresa
- **user** — cria seus own profiles e skills pessoais

## 💰 Planos

| Plano | Preço/usuário | Budget OpenRouter | Profiles |
|-------|---------------|-------------------|----------|
| Basic | R$49/mês | $15 USD/mês | 3 |
| Pro | R$149/mês | $50 USD/mês | ilimitado |
| Enterprise | R$499/mês | $200 USD/mês | ilimitado |

## 📄 Licença

MIT
