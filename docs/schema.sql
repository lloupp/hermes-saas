-- Hermes SaaS — Schema PostgreSQL 16
-- Multi-tenant com RLS (Row Level Security)

-- ============================================================
-- 1. EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('super_admin', 'company_admin', 'user');
CREATE TYPE plan_type AS ENUM ('basic', 'pro', 'enterprise');
CREATE TYPE skill_scope AS ENUM ('global', 'company', 'personal');
CREATE TYPE soul_scope AS ENUM ('global', 'company', 'personal');
CREATE TYPE interaction_status AS ENUM ('active', 'completed', 'escalated');

-- ============================================================
-- 3. TABELAS
-- ============================================================

-- Plans (definidos pela plataforma)
CREATE TABLE plans (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        plan_type NOT NULL UNIQUE,
    price_cents INTEGER NOT NULL,          -- em centavos BRL
    budget_usd  DECIMAL(10,2) NOT NULL,   -- budget OpenRouter em USD
    max_profiles INTEGER NOT NULL DEFAULT 3, -- 0 = ilimitado
    allowed_models TEXT[] NOT NULL DEFAULT '{}', -- vazio = todos
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Companies
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,       -- URL-friendly: "petshop-dog"
    plan_id         UUID NOT NULL REFERENCES plans(id),
    openrouter_key  TEXT,                        -- encrypted API key
    openrouter_budget_usd DECIMAL(10,2),         -- budget mensal real
    tone            TEXT DEFAULT 'profissional', -- tom padrão para SOULs
    knowledge_base  TEXT DEFAULT '',             -- contexto global da empresa
    rules           TEXT DEFAULT '',             -- regras da empresa
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_companies_slug ON companies(slug);

-- Users (funcionários)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    name            TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'user',
    password_hash   TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, email)
);
CREATE INDEX idx_users_company ON users(company_id);

-- SOUL Templates (globais da plataforma)
CREATE TABLE soul_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    description TEXT,
    content     TEXT NOT NULL,              -- template do SOUL.md com {{variáveis}}
    category    TEXT NOT NULL DEFAULT 'general', -- ex: 'atendimento', 'vendas', 'suporte'
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SOULs (criados por empresa ou funcionário)
CREATE TABLE souls (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = global (template)
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,     -- NULL = da empresa
    name        TEXT NOT NULL,
    content     TEXT NOT NULL,
    scope       soul_scope NOT NULL DEFAULT 'personal',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_souls_company ON souls(company_id);
CREATE INDEX idx_souls_user ON souls(user_id);

-- Skills Templates (globais da plataforma)
CREATE TABLE skill_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    description TEXT,
    content     TEXT NOT NULL,              -- SKILL.md content
    category    TEXT NOT NULL DEFAULT 'general',
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skills (criados por empresa ou funcionário)
CREATE TABLE skills (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,              -- lowercase, hyphens
    description TEXT,
    content     TEXT NOT NULL,              -- SKILL.md content
    scope       skill_scope NOT NULL DEFAULT 'personal',
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_skills_company ON skills(company_id);
CREATE INDEX idx_skills_user ON skills(user_id);

-- Profiles (criados pelo funcionário)
CREATE TABLE profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    soul_id         UUID REFERENCES souls(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    model           TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    custom_soul     TEXT,                      -- SOUL editado diretamente no profile
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_profiles_user ON profiles(user_id);

-- Profile-Skills (N:N: quais skills o profile usa)
CREATE TABLE profile_skills (
    profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    skill_template_id UUID REFERENCES skill_templates(id) ON DELETE CASCADE,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (profile_id, skill_id)
);

-- Clients (CRM da empresa)
CREATE TABLE clients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    metadata    JSONB DEFAULT '{}',        -- campos customizados
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_clients_company ON clients(company_id);
CREATE INDEX idx_clients_email ON clients(email);

-- Interactions (conversas no chat)
CREATE TABLE interactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    user_id         UUID REFERENCES users(id),
    profile_id      UUID NOT NULL REFERENCES profiles(id),
    client_id       UUID REFERENCES clients(id),
    messages        JSONB NOT NULL DEFAULT '[]',  -- [{role, content, timestamp}]
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    model_used      TEXT,
    status          interaction_status NOT NULL DEFAULT 'active',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);
CREATE INDEX idx_interactions_company ON interactions(company_id);
CREATE INDEX idx_interactions_profile ON interactions(profile_id);
CREATE INDEX idx_interactions_client ON interactions(client_id);
CREATE INDEX idx_interactions_started ON interactions(started_at);

-- Budget tracking (por empresa, por mês)
CREATE TABLE budget_usage (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    month       DATE NOT NULL,                   -- ex: 2026-06-01
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    cost_usd    DECIMAL(10,4) NOT NULL DEFAULT 0,
    budget_usd  DECIMAL(10,2) NOT NULL,         -- snapshot do budget naquele mês
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, month)
);
CREATE INDEX idx_budget_company ON budget_usage(company_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY (Multi-tenant isolation)
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE souls ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_usage ENABLE ROW LEVEL SECURITY;

-- Super admin vê tudo
CREATE POLICY super_admin_all ON companies FOR ALL
    USING (true) WITH CHECK (true);

-- Company: membros da empresa veem a própria
CREATE POLICY company_own ON companies FOR ALL
    USING (id = current_setting('app.company_id')::UUID);

-- Users: só da própria empresa
CREATE POLICY users_own_company ON users FOR ALL
    USING (company_id = current_setting('app.company_id')::UUID);

-- Souls: globals + da empresa + pessoais
CREATE POLICY souls_visible ON souls FOR ALL
    USING (
        scope = 'global'
        OR company_id = current_setting('app.company_id')::UUID
        OR (scope = 'personal' AND user_id = current_setting('app.user_id')::UUID)
    );

-- Skills: mesma lógica
CREATE POLICY skills_visible ON skills FOR ALL
    USING (
        scope = 'global'
        OR company_id = current_setting('app.company_id')::UUID
        OR (scope = 'personal' AND user_id = current_setting('app.user_id')::UUID)
    );

-- Profiles: do próprio usuário
CREATE POLICY profiles_own ON profiles FOR ALL
    USING (user_id = current_setting('app.user_id')::UUID);

-- Clients: da empresa
CREATE POLICY clients_own_company ON clients FOR ALL
    USING (company_id = current_setting('app.company_id')::UUID);

-- Interactions: da empresa
CREATE POLICY interactions_own_company ON interactions FOR ALL
    USING (company_id = current_setting('app.company_id')::UUID);

-- Budget: da empresa
CREATE POLICY budget_own_company ON budget_usage FOR ALL
    USING (company_id = current_setting('app.company_id')::UUID);

-- ============================================================
-- 5. DADOS INICIAIS
-- ============================================================
INSERT INTO plans (name, price_cents, budget_usd, max_profiles, allowed_models) VALUES
    ('basic',     4900,  15.00, 3,  ARRAY['openai/gpt-4o-mini','meta-llama/llama-3.1-8b-instruct']),
    ('pro',       14900, 50.00, 0,  ARRAY[]::TEXT[]),
    ('enterprise',49900, 200.00, 0,  ARRAY[]::TEXT[]);

-- Templates de SOUL iniciais
INSERT INTO soul_templates (name, description, content, category, is_default) VALUES
('Atendente Geral',
 'Atendente de suporte genérico, adaptável a qualquer empresa',
 '# Atendente Geral

Você é um atendente de suporte da empresa {{company.name}}.

## Tom
{{company.tone}}

## Conhecimento
{{company.knowledge_base}}

## Regras
- Responda sempre em português brasileiro
- Se não souber a resposta, diga que vai verificar e retorne em breve
- Jamais forneça informações de outras empresas
{{company.rules}}

## Identificação
Você atende como parte do time de {{user.name}}.',
 'atendimento', true),

('Vendedor',
 'Agente focado em vendas e conversão',
 '# Vendedor

Você é um consultor de vendas da empresa {{company.name}}.

## Tom
Persuasivo mas não agressivo. {{company.tone}}.

## Produto/Serviço
{{company.knowledge_base}}

## Regras de desconto
{{company.rules}}

## Objetivo
- Entenda a necessidade do cliente
- Apresente a solução ideal
- Foque em conversão sem pressionar
- Em PT-BR sempre.',
 'vendas', false);

-- Templates de Skill iniciais
INSERT INTO skill_templates (name, description, content, category, is_default) VALUES
('web-search',
 'Busca informações na web',
 '---
name: web-search
description: Busca informações na web quando você não sabe algo
---

# Web Search

Quando o usuário perguntar algo que você não sabe:
1. Use web_search(query)
2. Resuma o resultado
3. Cite a fonte',
 'general', true),

('calculator',
 'Faz cálculos matemáticos',
 '---
name: calculator
description: Realiza cálculos quando solicitado
---

# Calculator

Para qualquer cálculo:
1. Identifique os números e operação
2. Calcule com precisão
3. Mostre o passo a passo
4. Apresente o resultado final',
 'general', true);

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_companies_updated BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_souls_updated BEFORE UPDATE ON souls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_skills_updated BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update budget_usage quando interaction encerra
CREATE OR REPLACE FUNCTION update_budget_on_interaction_close()
RETURNS TRIGGER AS $$
DECLARE
    month_start DATE;
BEGIN
    IF NEW.ended_at IS NOT NULL AND (OLD.ended_at IS NULL OR OLD.ended_at <> NEW.ended_at) THEN
        month_start := DATE_TRUNC('month', NEW.started_at)::DATE;
        INSERT INTO budget_usage (company_id, month, tokens_in, tokens_out, cost_usd, budget_usd)
        VALUES (
            NEW.company_id,
            month_start,
            (NEW.tokens_used * 0.4)::INTEGER,  -- aproximação: 40% input
            (NEW.tokens_used * 0.6)::INTEGER,  -- 60% output
            0, -- será calculado pelo worker
            (SELECT openrouter_budget_usd FROM companies WHERE id = NEW.company_id)
        )
        ON CONFLICT (company_id, month) DO UPDATE
        SET tokens_in = budget_usage.tokens_in + (NEW.tokens_used * 0.4)::INTEGER,
            tokens_out = budget_usage.tokens_out + (NEW.tokens_used * 0.6)::INTEGER,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_interaction_budget AFTER UPDATE ON interactions
    FOR EACH ROW EXECUTE FUNCTION update_budget_on_interaction_close();
