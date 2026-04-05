use chrono::{Datelike, Duration, NaiveDate};
use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Serialize)]
struct TransactionRow {
    id: String,
    tx_date: String,
    description: String,
    amount: String,
    tx_type: String,
    category: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct CategoryRow {
    id: String,
    name: String,
    color: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct ScheduledExpenseRow {
    id: String,
    due_date: String,
    description: String,
    amount: String,
    tx_type: String,
    category: String,
    frequency: String,
    is_active: bool,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct BudgetRow {
    id: String,
    category: String,
    month: String,
    budget_amount: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct SavingsGoalRow {
    id: String,
    month: String,
    goal_amount: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct TransactionInput {
    tx_date: String,
    description: String,
    amount: String,
    tx_type: String,
    category: String,
}

#[derive(Debug, Deserialize)]
struct CategoryInput {
    name: String,
    color: String,
}

#[derive(Debug, Deserialize)]
struct ScheduledExpenseInput {
    due_date: String,
    description: String,
    amount: String,
    tx_type: String,
    category: String,
    frequency: String,
}

#[derive(Debug, Deserialize)]
struct BudgetInput {
    category: String,
    month: String,
    amount: String,
}

#[derive(Debug, Deserialize)]
struct SavingsGoalInput {
    month: String,
    amount: String,
}

#[derive(Debug, Deserialize)]
struct InboxCsvRow {
    tx_date: String,
    description: String,
    amount: String,
    tx_type: String,
    category: String,
}

#[tauri::command]
fn check_postgres_connection() -> Result<String, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let row = client
        .query_one("SELECT current_database(), current_user, version()", &[])
        .map_err(|error| format!("Query di verifica fallita: {}", format_postgres_error(&error)))?;

    let database: String = row.get(0);
    let current_user: String = row.get(1);
    let version: String = row.get(2);

    Ok(format!(
        "Connesso a {database} come {current_user}. Server: {version}"
    ))
}

#[tauri::command]
fn create_transaction(input: TransactionInput) -> Result<TransactionRow, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    validate_transaction_type(&input.tx_type)?;
    let tx_date = NaiveDate::parse_from_str(&input.tx_date, "%Y-%m-%d")
        .map_err(|_| "tx_date non valida: usa formato YYYY-MM-DD".to_string())?;

    let amount_text = input.amount.trim().replace(',', ".");
    let amount_value = amount_text
        .parse::<f64>()
        .map_err(|_| "amount non valido: inserisci un numero".to_string())?;

    if amount_value <= 0.0 {
        return Err("amount deve essere maggiore di 0".to_string());
    }

    let id = Uuid::new_v4();
    client
        .query_one(
            "INSERT INTO transactions (id, tx_date, description, amount, tx_type, category) VALUES ($1::uuid, $2::date, $3, ($4::text)::numeric, $5, $6) RETURNING id::text, tx_date::text, description, amount::text, tx_type, category, created_at::text",
            &[&id, &tx_date, &input.description, &amount_text, &input.tx_type, &input.category],
        )
        .map(map_row_to_transaction)
        .map_err(|error| format!("Inserimento fallito: {}", format_postgres_error(&error)))
}

#[tauri::command]
fn update_transaction(id: String, input: TransactionInput) -> Result<TransactionRow, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let parsed_id = Uuid::parse_str(&id).map_err(|_| "id transazione non valido".to_string())?;
    validate_transaction_type(&input.tx_type)?;
    let tx_date = NaiveDate::parse_from_str(&input.tx_date, "%Y-%m-%d")
        .map_err(|_| "tx_date non valida: usa formato YYYY-MM-DD".to_string())?;

    let amount_text = input.amount.trim().replace(',', ".");
    let amount_value = amount_text
        .parse::<f64>()
        .map_err(|_| "amount non valido: inserisci un numero".to_string())?;

    if amount_value <= 0.0 {
        return Err("amount deve essere maggiore di 0".to_string());
    }

    client
        .query_one(
            "UPDATE transactions SET tx_date = $2::date, description = $3, amount = ($4::text)::numeric, tx_type = $5, category = $6 WHERE id = $1::uuid RETURNING id::text, tx_date::text, description, amount::text, tx_type, category, created_at::text",
            &[&parsed_id, &tx_date, &input.description, &amount_text, &input.tx_type, &input.category],
        )
        .map(map_row_to_transaction)
        .map_err(|error| format!("Modifica fallita: {}", format_postgres_error(&error)))
}

#[tauri::command]
fn list_transactions() -> Result<Vec<TransactionRow>, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let rows = client
        .query(
            "SELECT id::text, tx_date::text, description, amount::text, tx_type, category, created_at::text FROM transactions ORDER BY tx_date DESC, created_at DESC",
            &[],
        )
        .map_err(|error| format!("Lettura movimenti fallita: {}", format_postgres_error(&error)))?;

    Ok(rows.into_iter().map(map_row_to_transaction).collect())
}

#[tauri::command]
fn get_balance() -> Result<String, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let row = client
        .query_one(
            "SELECT COALESCE(SUM(CASE WHEN tx_type = 'income' THEN amount ELSE -amount END), 0)::text FROM transactions",
            &[],
        )
        .map_err(|error| format!("Calcolo saldo fallito: {}", format_postgres_error(&error)))?;

    Ok(row.get::<_, String>(0))
}

#[tauri::command]
fn delete_transaction(id: String) -> Result<(), String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let parsed_id = Uuid::parse_str(&id).map_err(|_| "id transazione non valido".to_string())?;

    let affected = client
        .execute("DELETE FROM transactions WHERE id = $1::uuid", &[&parsed_id])
        .map_err(|error| format!("Eliminazione fallita: {}", format_postgres_error(&error)))?;

    if affected == 0 {
        return Err("Nessuna transazione trovata da eliminare".to_string());
    }

    Ok(())
}

#[tauri::command]
fn list_categories() -> Result<Vec<CategoryRow>, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let rows = client
        .query(
            "SELECT id::text, name, color, created_at::text FROM categories ORDER BY name ASC",
            &[],
        )
        .map_err(|error| format!("Lettura categorie fallita: {}", format_postgres_error(&error)))?;

    Ok(rows.into_iter().map(map_row_to_category).collect())
}

#[tauri::command]
fn create_category(input: CategoryInput) -> Result<CategoryRow, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let name = input.name.trim().to_string();
    let color = normalize_color(&input.color);

    if name.is_empty() {
        return Err("Nome categoria obbligatorio".to_string());
    }

    let id = Uuid::new_v4();
    client
        .query_one(
            "INSERT INTO categories (id, name, color) VALUES ($1::uuid, $2, $3) RETURNING id::text, name, color, created_at::text",
            &[&id, &name, &color],
        )
        .map(map_row_to_category)
        .map_err(|error| format!("Creazione categoria fallita: {}", format_postgres_error(&error)))
}

#[tauri::command]
fn delete_category(id: String) -> Result<(), String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let parsed_id = Uuid::parse_str(&id).map_err(|_| "id categoria non valido".to_string())?;

    let row = client
        .query_opt("SELECT name FROM categories WHERE id = $1::uuid", &[&parsed_id])
        .map_err(|error| format!("Lettura categoria fallita: {}", format_postgres_error(&error)))?;

    let Some(row) = row else {
        return Err("Categoria non trovata".to_string());
    };

    let category_name: String = row.get(0);
    let usage = client
        .query_one(
            "SELECT COUNT(*)::bigint FROM transactions WHERE category = $1",
            &[&category_name],
        )
        .map_err(|error| format!("Controllo utilizzo categoria fallito: {}", format_postgres_error(&error)))?;

    let in_use: i64 = usage.get(0);
    if in_use > 0 {
        return Err("Categoria usata in transazioni esistenti: non eliminabile".to_string());
    }

    client
        .execute(
            "DELETE FROM category_budgets WHERE category = $1",
            &[&category_name],
        )
        .map_err(|error| format!("Pulizia budget categoria fallita: {}", format_postgres_error(&error)))?;

    let affected = client
        .execute("DELETE FROM categories WHERE id = $1::uuid", &[&parsed_id])
        .map_err(|error| format!("Eliminazione categoria fallita: {}", format_postgres_error(&error)))?;

    if affected == 0 {
        return Err("Categoria non trovata".to_string());
    }

    Ok(())
}

#[tauri::command]
fn upsert_category_budget(input: BudgetInput) -> Result<BudgetRow, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let category = input.category.trim().to_string();
    let month = input.month.trim().to_string();

    if category.is_empty() {
        return Err("Categoria budget obbligatoria".to_string());
    }

    parse_budget_month(&month)?;

    let amount_text = input.amount.trim().replace(',', ".");
    let amount_value = amount_text
        .parse::<f64>()
        .map_err(|_| "amount budget non valido: inserisci un numero".to_string())?;

    if amount_value <= 0.0 {
        return Err("amount budget deve essere maggiore di 0".to_string());
    }

    let id = Uuid::new_v4();
    client
        .query_one(
            "INSERT INTO category_budgets (id, category, month, budget_amount) VALUES ($1::uuid, $2, $3, ($4::text)::numeric) ON CONFLICT (category, month) DO UPDATE SET budget_amount = EXCLUDED.budget_amount, updated_at = NOW() RETURNING id::text, category, month, budget_amount::text, created_at::text, updated_at::text",
            &[&id, &category, &month, &amount_text],
        )
        .map(map_row_to_budget)
        .map_err(|error| format!("Salvataggio budget fallito: {}", format_postgres_error(&error)))
}

#[tauri::command]
fn list_category_budgets() -> Result<Vec<BudgetRow>, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let rows = client
        .query(
            "SELECT id::text, category, month, budget_amount::text, created_at::text, updated_at::text FROM category_budgets ORDER BY month DESC, category ASC",
            &[],
        )
        .map_err(|error| format!("Lettura budget fallita: {}", format_postgres_error(&error)))?;

    Ok(rows.into_iter().map(map_row_to_budget).collect())
}

#[tauri::command]
fn delete_category_budget(id: String) -> Result<(), String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let parsed_id = Uuid::parse_str(&id).map_err(|_| "id budget non valido".to_string())?;

    let affected = client
        .execute(
            "DELETE FROM category_budgets WHERE id = $1::uuid",
            &[&parsed_id],
        )
        .map_err(|error| format!("Eliminazione budget fallita: {}", format_postgres_error(&error)))?;

    if affected == 0 {
        return Err("Budget non trovato".to_string());
    }

    Ok(())
}

#[tauri::command]
fn upsert_monthly_savings_goal(input: SavingsGoalInput) -> Result<SavingsGoalRow, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let month = input.month.trim().to_string();
    parse_budget_month(&month)?;

    let amount_text = input.amount.trim().replace(',', ".");
    let amount_value = amount_text
        .parse::<f64>()
        .map_err(|_| "amount obiettivo non valido: inserisci un numero".to_string())?;

    if amount_value <= 0.0 {
        return Err("amount obiettivo deve essere maggiore di 0".to_string());
    }

    let id = Uuid::new_v4();
    client
        .query_one(
            "INSERT INTO monthly_savings_goals (id, month, goal_amount) VALUES ($1::uuid, $2, ($3::text)::numeric) ON CONFLICT (month) DO UPDATE SET goal_amount = EXCLUDED.goal_amount, updated_at = NOW() RETURNING id::text, month, goal_amount::text, created_at::text, updated_at::text",
            &[&id, &month, &amount_text],
        )
        .map(map_row_to_savings_goal)
        .map_err(|error| format!("Salvataggio obiettivo risparmio fallito: {}", format_postgres_error(&error)))
}

#[tauri::command]
fn list_monthly_savings_goals() -> Result<Vec<SavingsGoalRow>, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let rows = client
        .query(
            "SELECT id::text, month, goal_amount::text, created_at::text, updated_at::text FROM monthly_savings_goals ORDER BY month DESC",
            &[],
        )
        .map_err(|error| format!("Lettura obiettivi risparmio fallita: {}", format_postgres_error(&error)))?;

    Ok(rows.into_iter().map(map_row_to_savings_goal).collect())
}

#[tauri::command]
fn delete_monthly_savings_goal(id: String) -> Result<(), String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let parsed_id = Uuid::parse_str(&id).map_err(|_| "id obiettivo risparmio non valido".to_string())?;

    let affected = client
        .execute(
            "DELETE FROM monthly_savings_goals WHERE id = $1::uuid",
            &[&parsed_id],
        )
        .map_err(|error| format!("Eliminazione obiettivo risparmio fallita: {}", format_postgres_error(&error)))?;

    if affected == 0 {
        return Err("Obiettivo risparmio non trovato".to_string());
    }

    Ok(())
}

#[tauri::command]
fn create_scheduled_expense(input: ScheduledExpenseInput) -> Result<ScheduledExpenseRow, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let due_date = NaiveDate::parse_from_str(&input.due_date, "%Y-%m-%d")
        .map_err(|_| "due_date non valida: usa formato YYYY-MM-DD".to_string())?;
    let description = input.description.trim().to_string();
    let category = input.category.trim().to_string();
    let frequency = input.frequency.trim().to_lowercase();
    let tx_type = input.tx_type.trim().to_lowercase();

    if description.is_empty() {
        return Err("Descrizione obbligatoria".to_string());
    }

    if category.is_empty() {
        return Err("Categoria obbligatoria".to_string());
    }

    validate_schedule_frequency(&frequency)?;
    validate_transaction_type(&tx_type)?;

    let amount_text = input.amount.trim().replace(',', ".");
    let amount_value = amount_text
        .parse::<f64>()
        .map_err(|_| "amount non valido: inserisci un numero".to_string())?;

    if amount_value <= 0.0 {
        return Err("amount deve essere maggiore di 0".to_string());
    }

    let id = Uuid::new_v4();
    client
        .query_one(
            "INSERT INTO scheduled_expenses (id, due_date, description, amount, tx_type, category, frequency, is_active) VALUES ($1::uuid, $2::date, $3, ($4::text)::numeric, $5, $6, $7, TRUE) RETURNING id::text, due_date::text, description, amount::text, tx_type, category, frequency, is_active, created_at::text",
            &[&id, &due_date, &description, &amount_text, &tx_type, &category, &frequency],
        )
        .map(map_row_to_scheduled_expense)
        .map_err(|error| format!("Creazione spesa programmata fallita: {}", format_postgres_error(&error)))
}

#[tauri::command]
fn list_scheduled_expenses() -> Result<Vec<ScheduledExpenseRow>, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let rows = client
        .query(
            "SELECT id::text, due_date::text, description, amount::text, tx_type, category, frequency, is_active, created_at::text FROM scheduled_expenses ORDER BY due_date ASC, created_at DESC",
            &[],
        )
        .map_err(|error| format!("Lettura spese programmate fallita: {}", format_postgres_error(&error)))?;

    Ok(rows.into_iter().map(map_row_to_scheduled_expense).collect())
}

#[tauri::command]
fn delete_scheduled_expense(id: String) -> Result<(), String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let parsed_id = Uuid::parse_str(&id).map_err(|_| "id spesa programmata non valido".to_string())?;

    let affected = client
        .execute(
            "DELETE FROM scheduled_expenses WHERE id = $1::uuid",
            &[&parsed_id],
        )
        .map_err(|error| {
            format!(
                "Eliminazione spesa programmata fallita: {}",
                format_postgres_error(&error)
            )
        })?;

    if affected == 0 {
        return Err("Spesa programmata non trovata".to_string());
    }

    Ok(())
}

#[tauri::command]
fn process_scheduled_expenses() -> Result<i64, String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    let today = chrono::Local::now().date_naive();

    let schedule_rows = client
        .query(
            "SELECT id::text, due_date::text, description, amount::text, tx_type, category, frequency FROM scheduled_expenses WHERE is_active = TRUE AND due_date <= $1::date ORDER BY due_date ASC",
            &[&today],
        )
        .map_err(|error| format!("Lettura pianificazioni fallita: {}", format_postgres_error(&error)))?;

    let mut generated: i64 = 0;

    for row in schedule_rows {
        let schedule_id_text: String = row.get(0);
        let schedule_id = Uuid::parse_str(&schedule_id_text)
            .map_err(|_| "id spesa programmata non valido".to_string())?;
        let mut due_date = NaiveDate::parse_from_str(&row.get::<_, String>(1), "%Y-%m-%d")
            .map_err(|_| "due_date non valida nella pianificazione".to_string())?;
        let description: String = row.get(2);
        let amount_text: String = row.get(3);
        let tx_type: String = row.get(4);
        let category: String = row.get(5);
        let frequency: String = row.get(6);

        validate_transaction_type(&tx_type)?;
        validate_schedule_frequency(&frequency)?;

        while due_date <= today {
            let tx_id = Uuid::new_v4();
            client
                .execute(
                    "INSERT INTO transactions (id, tx_date, description, amount, tx_type, category) VALUES ($1::uuid, $2::date, $3, ($4::text)::numeric, $5, $6)",
                    &[&tx_id, &due_date, &description, &amount_text, &tx_type, &category],
                )
                .map_err(|error| {
                    format!(
                        "Generazione movimento da pianificazione fallita: {}",
                        format_postgres_error(&error)
                    )
                })?;

            generated += 1;

            if frequency == "once" {
                client
                    .execute(
                        "UPDATE scheduled_expenses SET is_active = FALSE WHERE id = $1::uuid",
                        &[&schedule_id],
                    )
                    .map_err(|error| {
                        format!(
                            "Aggiornamento pianificazione fallito: {}",
                            format_postgres_error(&error)
                        )
                    })?;
                break;
            }

            due_date = next_due_date(due_date, &frequency)?;
            client
                .execute(
                    "UPDATE scheduled_expenses SET due_date = $2::date WHERE id = $1::uuid",
                    &[&schedule_id, &due_date],
                )
                .map_err(|error| {
                    format!(
                        "Aggiornamento prossima scadenza fallito: {}",
                        format_postgres_error(&error)
                    )
                })?;
        }
    }

    Ok(generated)
}

#[tauri::command]
fn sync_transactions_from_csv_inbox() -> Result<i64, String> {
    dotenvy::dotenv().ok();

    let inbox_path = match env::var("INBOX_CSV_PATH") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return Ok(0),
    };

    let path = PathBuf::from(inbox_path);
    if !path.exists() {
        return Ok(0);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Lettura inbox CSV fallita: {error}"))?;
    if contents.trim().is_empty() {
        return Ok(0);
    }

    let mut client = connect_client()?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .trim(csv::Trim::All)
        .flexible(true)
        .from_reader(contents.as_bytes());

    let mut inserted: i64 = 0;
    for row in reader.deserialize::<InboxCsvRow>() {
        let row = row.map_err(|error| format!("Parsing inbox CSV fallito: {error}"))?;
        validate_transaction_type(&row.tx_type)?;

        let tx_date = NaiveDate::parse_from_str(&row.tx_date, "%Y-%m-%d")
            .map_err(|_| "tx_date non valida nel CSV: usa formato YYYY-MM-DD".to_string())?;
        let amount_text = row.amount.trim().replace(',', ".");
        let amount_value = amount_text
            .parse::<f64>()
            .map_err(|_| "amount non valido nel CSV: inserisci un numero".to_string())?;

        if amount_value <= 0.0 {
            return Err("amount nel CSV deve essere maggiore di 0".to_string());
        }

        let description = row.description.trim().to_string();
        let category = row.category.trim().to_string();
        if description.is_empty() {
            return Err("description nel CSV non puo essere vuota".to_string());
        }
        if category.is_empty() {
            return Err("category nel CSV non puo essere vuota".to_string());
        }

        let duplicate = client
            .query_opt(
                "SELECT 1 FROM transactions WHERE tx_date = $1::date AND description = $2 AND amount = ($3::text)::numeric AND tx_type = $4 AND category = $5 LIMIT 1",
                &[&tx_date, &description, &amount_text, &row.tx_type, &category],
            )
            .map_err(|error| format!("Controllo duplicati CSV fallito: {}", format_postgres_error(&error)))?
            .is_some();

        if duplicate {
            continue;
        }

        let id = Uuid::new_v4();
        client
            .execute(
                "INSERT INTO transactions (id, tx_date, description, amount, tx_type, category) VALUES ($1::uuid, $2::date, $3, ($4::text)::numeric, $5, $6)",
                &[&id, &tx_date, &description, &amount_text, &row.tx_type, &category],
            )
            .map_err(|error| format!("Import riga CSV fallito: {}", format_postgres_error(&error)))?;

        inserted += 1;
    }

    fs::write(&path, "tx_date,description,amount,tx_type,category\n")
        .map_err(|error| format!("Reset inbox CSV fallito: {error}"))?;

    Ok(inserted)
}

fn connect_client() -> Result<Client, String> {
    let host = env::var("POSTGRES_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = env::var("POSTGRES_PORT").unwrap_or_else(|_| "5432".to_string());
    let user = env::var("POSTGRES_USER").unwrap_or_else(|_| "postgres".to_string());
    let password = env::var("POSTGRES_PASSWORD").unwrap_or_default();
    let dbname = env::var("POSTGRES_DB").unwrap_or_else(|_| "gestionale_finanze".to_string());

    let connection_string =
        format!("host={host} port={port} user={user} password={password} dbname={dbname}");

    Client::connect(&connection_string, NoTls)
        .map_err(|error| format!("Connessione fallita: {}", format_postgres_error(&error)))
}

fn validate_transaction_type(tx_type: &str) -> Result<(), String> {
    match tx_type {
        "income" | "expense" => Ok(()),
        _ => Err("tx_type deve essere 'income' oppure 'expense'".to_string()),
    }
}

fn validate_schedule_frequency(frequency: &str) -> Result<(), String> {
    match frequency {
        "once" | "weekly" | "monthly" | "yearly" => Ok(()),
        _ => Err("frequency deve essere 'once', 'weekly', 'monthly' o 'yearly'".to_string()),
    }
}

fn parse_budget_month(month: &str) -> Result<NaiveDate, String> {
    let date_text = format!("{month}-01");
    NaiveDate::parse_from_str(&date_text, "%Y-%m-%d")
        .map_err(|_| "month non valido: usa formato YYYY-MM".to_string())
}

fn next_due_date(current: NaiveDate, frequency: &str) -> Result<NaiveDate, String> {
    match frequency {
        "weekly" => Ok(current + Duration::days(7)),
        "monthly" => add_months_safe(current, 1),
        "yearly" => add_months_safe(current, 12),
        "once" => Ok(current),
        _ => Err("frequency non valida".to_string()),
    }
}

fn add_months_safe(current: NaiveDate, months_to_add: i32) -> Result<NaiveDate, String> {
    let total_months = (current.year() * 12 + current.month() as i32 - 1) + months_to_add;
    let target_year = total_months.div_euclid(12);
    let target_month = (total_months.rem_euclid(12) + 1) as u32;
    let last_day = days_in_month(target_year, target_month)?;
    let target_day = current.day().min(last_day);

    NaiveDate::from_ymd_opt(target_year, target_month, target_day)
        .ok_or_else(|| "Calcolo prossima scadenza non riuscito".to_string())
}

fn days_in_month(year: i32, month: u32) -> Result<u32, String> {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };

    let first_of_next = NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .ok_or_else(|| "Data mese successivo non valida".to_string())?;
    Ok((first_of_next - Duration::days(1)).day())
}

fn map_row_to_transaction(row: postgres::Row) -> TransactionRow {
    TransactionRow {
        id: row.get(0),
        tx_date: row.get(1),
        description: row.get(2),
        amount: row.get(3),
        tx_type: row.get(4),
        category: row.get(5),
        created_at: row.get(6),
    }
}

fn map_row_to_category(row: postgres::Row) -> CategoryRow {
    CategoryRow {
        id: row.get(0),
        name: row.get(1),
        color: row.get(2),
        created_at: row.get(3),
    }
}

fn map_row_to_scheduled_expense(row: postgres::Row) -> ScheduledExpenseRow {
    ScheduledExpenseRow {
        id: row.get(0),
        due_date: row.get(1),
        description: row.get(2),
        amount: row.get(3),
        tx_type: row.get(4),
        category: row.get(5),
        frequency: row.get(6),
        is_active: row.get(7),
        created_at: row.get(8),
    }
}

fn map_row_to_budget(row: postgres::Row) -> BudgetRow {
    BudgetRow {
        id: row.get(0),
        category: row.get(1),
        month: row.get(2),
        budget_amount: row.get(3),
        created_at: row.get(4),
        updated_at: row.get(5),
    }
}

fn map_row_to_savings_goal(row: postgres::Row) -> SavingsGoalRow {
    SavingsGoalRow {
        id: row.get(0),
        month: row.get(1),
        goal_amount: row.get(2),
        created_at: row.get(3),
        updated_at: row.get(4),
    }
}

fn normalize_color(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with('#') && trimmed.len() == 7 {
        return trimmed.to_uppercase();
    }

    "#5C7CFA".to_string()
}

fn initialize_database() -> Result<(), String> {
    dotenvy::dotenv().ok();

    let mut client = connect_client()?;
    client
        .batch_execute(
            "
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

            ALTER TABLE scheduled_expenses ADD COLUMN IF NOT EXISTS tx_type TEXT;
            UPDATE scheduled_expenses SET tx_type = 'expense' WHERE tx_type IS NULL OR TRIM(tx_type) = '';
            ALTER TABLE scheduled_expenses ALTER COLUMN tx_type SET DEFAULT 'expense';
            ALTER TABLE scheduled_expenses ALTER COLUMN tx_type SET NOT NULL;
            ",
        )
        .map_err(|error| format!("Inizializzazione database fallita: {}", format_postgres_error(&error)))?;

    let defaults = [
        ("Generale", "#5C7CFA"),
        ("Casa", "#0CA678"),
        ("Trasporti", "#F59F00"),
        ("Svago", "#E64980"),
    ];

    for (name, color) in defaults {
        let id = Uuid::new_v4();
        client
            .execute(
                "INSERT INTO categories (id, name, color) VALUES ($1::uuid, $2, $3) ON CONFLICT (name) DO NOTHING",
                &[&id, &name, &color],
            )
            .map_err(|error| format!("Seed categorie default fallito: {}", format_postgres_error(&error)))?;
    }

    let legacy_rows = client
        .query(
            "SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL AND TRIM(category) <> ''",
            &[],
        )
        .map_err(|error| format!("Lettura categorie legacy fallita: {}", format_postgres_error(&error)))?;

    for row in legacy_rows {
        let category_name: String = row.get(0);
        let id = Uuid::new_v4();
        let color = "#5C7CFA".to_string();
        client
            .execute(
                "INSERT INTO categories (id, name, color) VALUES ($1::uuid, $2, $3) ON CONFLICT (name) DO NOTHING",
                &[&id, &category_name, &color],
            )
            .map_err(|error| format!("Import categorie legacy fallito: {}", format_postgres_error(&error)))?;
    }

    Ok(())
}

fn format_postgres_error(error: &postgres::Error) -> String {
    if let Some(db_error) = error.as_db_error() {
        let mut details = vec![format!(
            "{} (SQLSTATE {})",
            db_error.message(),
            db_error.code().code()
        )];

        if let Some(detail) = db_error.detail() {
            details.push(format!("detail: {detail}"));
        }

        if let Some(hint) = db_error.hint() {
            details.push(format!("hint: {hint}"));
        }

        return details.join(" | ");
    }

    error.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = initialize_database() {
        panic!("{error}");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_postgres_connection,
            create_transaction,
            update_transaction,
            list_transactions,
            get_balance,
            delete_transaction,
            list_categories,
            create_category,
            delete_category,
            create_scheduled_expense,
            list_scheduled_expenses,
            delete_scheduled_expense,
            process_scheduled_expenses,
            upsert_category_budget,
            list_category_budgets,
            delete_category_budget,
            upsert_monthly_savings_goal,
            list_monthly_savings_goals,
            delete_monthly_savings_goal,
            sync_transactions_from_csv_inbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
