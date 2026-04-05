-- Schema PostgreSQL per Conti Caprino / Gestionale Finanze
-- Eseguibile in modo idempotente (CREATE IF NOT EXISTS + ALTER IF NOT EXISTS)

BEGIN;

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    tx_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    tx_type TEXT NOT NULL CHECK (tx_type IN ('income', 'expense')),
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#5C7CFA',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_expenses (
    id UUID PRIMARY KEY,
    due_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    tx_type TEXT NOT NULL DEFAULT 'expense' CHECK (tx_type IN ('income', 'expense')),
    category TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'once' CHECK (frequency IN ('once', 'weekly', 'monthly', 'yearly')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_budgets (
    id UUID PRIMARY KEY,
    category TEXT NOT NULL,
    month TEXT NOT NULL,
    budget_amount NUMERIC(12,2) NOT NULL CHECK (budget_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (category, month)
);

CREATE TABLE IF NOT EXISTS monthly_savings_goals (
    id UUID PRIMARY KEY,
    month TEXT NOT NULL UNIQUE,
    goal_amount NUMERIC(12,2) NOT NULL CHECK (goal_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrazione retrocompatibile per installazioni precedenti
ALTER TABLE scheduled_expenses ADD COLUMN IF NOT EXISTS tx_type TEXT;
UPDATE scheduled_expenses
SET tx_type = 'expense'
WHERE tx_type IS NULL OR TRIM(tx_type) = '';
ALTER TABLE scheduled_expenses ALTER COLUMN tx_type SET DEFAULT 'expense';
ALTER TABLE scheduled_expenses ALTER COLUMN tx_type SET NOT NULL;

-- Indici utili per query frequenti
CREATE INDEX IF NOT EXISTS idx_transactions_date_created
ON transactions (tx_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_category
ON transactions (category);

CREATE INDEX IF NOT EXISTS idx_scheduled_expenses_due_date
ON scheduled_expenses (due_date ASC);

CREATE INDEX IF NOT EXISTS idx_category_budgets_month
ON category_budgets (month DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_savings_goals_month
ON monthly_savings_goals (month DESC);

COMMIT;
