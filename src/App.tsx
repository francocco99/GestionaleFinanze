import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import logoImg from "./assets/logo-capra.png";
import "./App.css";

type TransactionType = "income" | "expense";

type TransactionRow = {
  id: string;
  tx_date: string;
  description: string;
  amount: string;
  tx_type: TransactionType;
  category: string;
  created_at: string;
};

type CategoryRow = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

type ScheduledFrequency = "once" | "weekly" | "monthly" | "yearly";

type ScheduledExpenseRow = {
  id: string;
  due_date: string;
  description: string;
  amount: string;
  tx_type: TransactionType;
  category: string;
  frequency: ScheduledFrequency;
  is_active: boolean;
  created_at: string;
};

type BudgetRow = {
  id: string;
  category: string;
  month: string;
  budget_amount: string;
  created_at: string;
  updated_at: string;
};

type SavingsGoalRow = {
  id: string;
  month: string;
  goal_amount: string;
  created_at: string;
  updated_at: string;
};

type MainTab = "home" | "new-transaction" | "scheduled" | "analysis" | "categories";

type Filters = {
  month: string;
  day: string;
  tx_type: "all" | TransactionType;
  category: string;
  search: string;
};

type MonthlyTrendPoint = {
  day: number;
  dailyNet: number;
  runningBalance: number;
};

type TrendSvgPoint = {
  x: number;
  y: number;
  day: number;
  dailyNet: number;
  runningBalance: number;
};

type TrendView = {
  points: TrendSvgPoint[];
  linePath: string;
  areaPath: string;
  zeroY: number;
  latestBalance: number;
  totalIncrease: number;
  totalDecrease: number;
  selectedPoint: MonthlyTrendPoint | null;
};

type PieSlice = {
  category: string;
  total: number;
  color: string;
  start: number;
  end: number;
};

function formatMonth(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatDay(date: Date) {
  return String(date.getDate()).padStart(2, "0");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Errore sconosciuto";
  }
}

function matchesFilters(transaction: TransactionRow, filters: Filters) {
  if (filters.month && !transaction.tx_date.startsWith(filters.month)) {
    return false;
  }

  if (filters.tx_type !== "all" && transaction.tx_type !== filters.tx_type) {
    return false;
  }

  if (filters.category !== "all" && transaction.category !== filters.category) {
    return false;
  }

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${transaction.description} ${transaction.category}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

function buildPieChartByType(
  transactions: TransactionRow[],
  categoryColorByName: Map<string, string>,
  txType: TransactionType,
) {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.tx_type !== txType) {
      continue;
    }

    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + Number(transaction.amount));
  }

  const rowsBase = Array.from(totals.entries())
    .map(([category, total]) => ({
      category,
      total,
      color: categoryColorByName.get(category) ?? "#F2A65A",
    }))
    .sort((first, second) => second.total - first.total)
    .slice(0, 7);

  const total = rowsBase.reduce((sum, row) => sum + row.total, 0);
  let cursor = 0;

  const rows: PieSlice[] = rowsBase.map((row) => {
    const angle = total > 0 ? (row.total / total) * 360 : 0;
    const slice = {
      ...row,
      start: cursor,
      end: cursor + angle,
    };
    cursor += angle;
    return slice;
  });

  return { rows, total };
}

function buildMonthlyTrend(transactions: TransactionRow[], month: string) {
  if (!month) {
    return { rows: [] as MonthlyTrendPoint[], maxAbs: 0 };
  }

  const monthTransactions = transactions.filter((transaction) => transaction.tx_date.startsWith(month));
  const [yearPart, monthPart] = month.split("-");
  const daysInMonth = new Date(Number(yearPart), Number(monthPart), 0).getDate();

  let runningBalance = 0;
  const rows = Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const dateKey = `${month}-${day}`;
    const dayTransactions = monthTransactions.filter((transaction) => transaction.tx_date === dateKey);

    const income = dayTransactions
      .filter((transaction) => transaction.tx_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const expense = dayTransactions
      .filter((transaction) => transaction.tx_type === "expense")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const dailyNet = income - expense;
    runningBalance += dailyNet;

    return {
      day: index + 1,
      dailyNet,
      runningBalance,
    };
  }).filter((row) => row.dailyNet !== 0 || row.runningBalance !== 0);

  const maxAbs = rows.reduce((largest, row) => {
    const current = Math.abs(row.runningBalance);
    return current > largest ? current : largest;
  }, 0);

  return { rows, maxAbs };
}

function buildTrendView(rows: MonthlyTrendPoint[], maxAbs: number, selectedDay: number): TrendView {
  if (rows.length === 0) {
    return {
      points: [],
      linePath: "",
      areaPath: "",
      zeroY: 90,
      latestBalance: 0,
      totalIncrease: 0,
      totalDecrease: 0,
      selectedPoint: null,
    };
  }

  const width = 720;
  const height = 210;
  const paddingX = 18;
  const paddingY = 20;
  const domain = maxAbs > 0 ? maxAbs : 1;
  const toY = (value: number) => {
    const normalized = (value + domain) / (2 * domain);
    return height - paddingY - normalized * (height - paddingY * 2);
  };

  const stepX = rows.length > 1 ? (width - paddingX * 2) / (rows.length - 1) : 0;
  const points: TrendSvgPoint[] = rows.map((row, index) => ({
    x: paddingX + index * stepX,
    y: toY(row.runningBalance),
    day: row.day,
    dailyNet: row.dailyNet,
    runningBalance: row.runningBalance,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x.toFixed(2)} ${(height - paddingY).toFixed(2)} L${points[0].x.toFixed(2)} ${(height - paddingY).toFixed(2)} Z`
      : "";

  const zeroY = toY(0);
  const latestBalance = rows[rows.length - 1].runningBalance;
  const totalIncrease = rows.reduce((sum, row) => sum + (row.dailyNet > 0 ? row.dailyNet : 0), 0);
  const totalDecrease = rows.reduce((sum, row) => sum + (row.dailyNet < 0 ? Math.abs(row.dailyNet) : 0), 0);
  const selectedPoint = rows.find((row) => row.day === selectedDay) ?? rows[rows.length - 1];

  return {
    points,
    linePath,
    areaPath,
    zeroY,
    latestBalance,
    totalIncrease,
    totalDecrease,
    selectedPoint,
  };
}

function App() {
  const currentDate = new Date();
  const currentMonth = formatMonth(currentDate);
  const currentDay = formatDay(currentDate);

  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [, setStatus] = useState("Pronta");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [scheduledExpenses, setScheduledExpenses] = useState<ScheduledExpenseRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoalRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAllAnalysisBudgets, setShowAllAnalysisBudgets] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    month: currentMonth,
    day: currentDay,
    tx_type: "all",
    category: "all",
    search: "",
  });
  const [transactionForm, setTransactionForm] = useState({
    tx_date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    tx_type: "expense" as TransactionType,
    category: "",
  });
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    color: "#F2A65A",
  });
  const [budgetForm, setBudgetForm] = useState({
    category: "",
    month: currentMonth,
    amount: "",
  });
  const [savingsGoalForm, setSavingsGoalForm] = useState({
    month: currentMonth,
    amount: "",
  });
  const [scheduledForm, setScheduledForm] = useState({
    due_date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    tx_type: "expense" as TransactionType,
    category: "",
    frequency: "monthly" as ScheduledFrequency,
  });

  useEffect(() => {
    void refreshData();
  }, []);

  useEffect(() => {
    if (categories.length > 0 && !transactionForm.category) {
      setTransactionForm((current) => ({
        ...current,
        category: categories[0].name,
      }));
    }

    if (categories.length > 0 && !scheduledForm.category) {
      setScheduledForm((current) => ({
        ...current,
        category: categories[0].name,
      }));
    }

    if (categories.length > 0 && !budgetForm.category) {
      setBudgetForm((current) => ({
        ...current,
        category: categories[0].name,
      }));
    }
  }, [budgetForm.category, categories, scheduledForm.category, transactionForm.category]);

  const categoryNames = useMemo(
    () => categories.map((category) => category.name).sort((first, second) => first.localeCompare(second)),
    [categories],
  );

  const categoryColorByName = useMemo(
    () => new Map(categories.map((category) => [category.name, category.color])),
    [categories],
  );
  const selectedTransactionCategoryColor = transactionForm.category
    ? (categoryColorByName.get(transactionForm.category) ?? "#F2A65A")
    : "#F2A65A";
  const selectedScheduledCategoryColor = scheduledForm.category
    ? (categoryColorByName.get(scheduledForm.category) ?? "#F2A65A")
    : "#F2A65A";
  const selectedFilterCategoryColor = filters.category !== "all"
    ? (categoryColorByName.get(filters.category) ?? "#F2A65A")
    : "#F2A65A";

  const totalSummary = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const transaction of transactions) {
      const value = Number(transaction.amount);
      if (transaction.tx_type === "income") {
        income += value;
      } else {
        expense += value;
      }
    }

    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => matchesFilters(transaction, filters));
  }, [filters, transactions]);

  const filteredSummary = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const transaction of filteredTransactions) {
      const value = Number(transaction.amount);
      if (transaction.tx_type === "income") {
        income += value;
      } else {
        expense += value;
      }
    }

    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [filteredTransactions]);

  const latestFilteredMonth = useMemo(() => {
    const months = Array.from(new Set(filteredTransactions.map((transaction) => transaction.tx_date.slice(0, 7)))).sort();
    return months.length > 0 ? months[months.length - 1] : "";
  }, [filteredTransactions]);

  const analysisMonth = filters.month || latestFilteredMonth || currentMonth;
  const analysisExpensePieChart = useMemo(
    () => buildPieChartByType(filteredTransactions, categoryColorByName, "expense"),
    [filteredTransactions, categoryColorByName],
  );
  const analysisIncomePieChart = useMemo(
    () => buildPieChartByType(filteredTransactions, categoryColorByName, "income"),
    [filteredTransactions, categoryColorByName],
  );
  const analysisMonthlyTrend = useMemo(() => buildMonthlyTrend(filteredTransactions, analysisMonth), [filteredTransactions, analysisMonth]);
  const analysisSelectedDay = Number(filters.day) || Number(currentDay);
  const analysisTrendView = useMemo(
    () => buildTrendView(analysisMonthlyTrend.rows, analysisMonthlyTrend.maxAbs, analysisSelectedDay),
    [analysisMonthlyTrend.maxAbs, analysisMonthlyTrend.rows, analysisSelectedDay],
  );

  const currentMonthTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.tx_date.startsWith(currentMonth)),
    [transactions, currentMonth],
  );

  const homeSummary = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const transaction of currentMonthTransactions) {
      const value = Number(transaction.amount);
      if (transaction.tx_type === "income") {
        income += value;
      } else {
        expense += value;
      }
    }

    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [currentMonthTransactions]);

  const expenseByMonthCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.tx_type !== "expense") {
        continue;
      }
      const month = transaction.tx_date.slice(0, 7);
      const key = `${month}__${transaction.category}`;
      totals.set(key, (totals.get(key) ?? 0) + Number(transaction.amount));
    }
    return totals;
  }, [transactions]);

  const budgetUsageRows = useMemo(() => {
    return budgets
      .map((budget) => {
        const limit = Number(budget.budget_amount);
        const key = `${budget.month}__${budget.category}`;
        const spent = expenseByMonthCategory.get(key) ?? 0;
        const remaining = limit - spent;
        return {
          ...budget,
          limit,
          spent,
          remaining,
          progress: limit > 0 ? (spent / limit) * 100 : 0,
          isOver: spent > limit,
        };
      })
      .sort((a, b) => {
        if (a.month !== b.month) {
          return b.month.localeCompare(a.month);
        }
        return b.progress - a.progress;
      });
  }, [budgets, expenseByMonthCategory]);

  const currentMonthBudgetAlerts = useMemo(
    () => budgetUsageRows.filter((item) => item.month === currentMonth && item.isOver),
    [budgetUsageRows, currentMonth],
  );

  const savingsGoalByMonth = useMemo(
    () => new Map(savingsGoals.map((goal) => [goal.month, goal])),
    [savingsGoals],
  );

  const currentMonthSavingsGoal = savingsGoalByMonth.get(currentMonth);
  const analysisMonthSavingsGoal = savingsGoalByMonth.get(analysisMonth);

  const analysisBudgetRows = useMemo(
    () => (showAllAnalysisBudgets ? budgetUsageRows : budgetUsageRows.filter((row) => row.month === analysisMonth)),
    [analysisMonth, budgetUsageRows, showAllAnalysisBudgets],
  );

  const homeGoalProgress = useMemo(() => {
    if (!currentMonthSavingsGoal) {
      return null;
    }

    const goal = Number(currentMonthSavingsGoal.goal_amount);
    const achieved = homeSummary.balance;
    const remaining = goal - achieved;
    const progress = goal > 0 ? (achieved / goal) * 100 : 0;

    return {
      goal,
      achieved,
      remaining,
      progress,
      isReached: achieved >= goal,
    };
  }, [currentMonthSavingsGoal, homeSummary.balance]);

  const homeExpensePieChart = useMemo(
    () => buildPieChartByType(currentMonthTransactions, categoryColorByName, "expense"),
    [currentMonthTransactions, categoryColorByName],
  );
  const homeIncomePieChart = useMemo(
    () => buildPieChartByType(currentMonthTransactions, categoryColorByName, "income"),
    [currentMonthTransactions, categoryColorByName],
  );
  const homeMonthlyTrend = useMemo(() => buildMonthlyTrend(currentMonthTransactions, currentMonth), [currentMonthTransactions, currentMonth]);
  const homeSelectedDay = Number(currentDay);
  const homeTrendView = useMemo(
    () => buildTrendView(homeMonthlyTrend.rows, homeMonthlyTrend.maxAbs, homeSelectedDay),
    [homeMonthlyTrend.maxAbs, homeMonthlyTrend.rows, homeSelectedDay],
  );

  const latestTransaction = useMemo(() => {
    if (transactions.length === 0) {
      return null;
    }

    return [...transactions].sort((first, second) => {
      const firstDate = new Date(`${first.tx_date}T00:00:00`).getTime();
      const secondDate = new Date(`${second.tx_date}T00:00:00`).getTime();
      if (firstDate !== secondDate) {
        return secondDate - firstDate;
      }
      return second.created_at.localeCompare(first.created_at);
    })[0];
  }, [transactions]);

  const resetFilters = () => {
    setFilters({
      month: currentMonth,
      day: currentDay,
      tx_type: "all",
      category: "all",
      search: "",
    });
  };

  async function refreshData() {
    try {
      const imported = await invoke<number>("sync_transactions_from_csv_inbox");
      const generated = await invoke<number>("process_scheduled_expenses");
      const [rows, categoryRows, scheduledRows, budgetRows, savingsGoalRows] = await Promise.all([
        invoke<TransactionRow[]>("list_transactions"),
        invoke<CategoryRow[]>("list_categories"),
        invoke<ScheduledExpenseRow[]>("list_scheduled_expenses"),
        invoke<BudgetRow[]>("list_category_budgets"),
        invoke<SavingsGoalRow[]>("list_monthly_savings_goals"),
      ]);

      setTransactions(rows);
      setCategories(categoryRows);
      setScheduledExpenses(scheduledRows);
      setBudgets(budgetRows);
      setSavingsGoals(savingsGoalRows);
      if (imported > 0 || generated > 0) {
        setStatus(
          `Importati da CSV: ${imported}. Generati da pianificazioni: ${generated}. Movimenti caricati: ${rows.length}`,
        );
      } else {
        setStatus(`Movimenti caricati: ${rows.length}`);
      }
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function saveTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!transactionForm.category) {
      setStatus("Seleziona una categoria");
      return;
    }

    setLoading(true);
    setStatus(editingId ? "Aggiornamento in corso..." : "Salvataggio in corso...");

    try {
      if (editingId) {
        await invoke<TransactionRow>("update_transaction", {
          id: editingId,
          input: transactionForm,
        });
      } else {
        await invoke<TransactionRow>("create_transaction", {
          input: transactionForm,
        });
      }

      setEditingId(null);
      setTransactionForm({
        tx_date: new Date().toISOString().slice(0, 10),
        description: "",
        amount: "",
        tx_type: "expense",
        category: categories[0]?.name ?? "",
      });

      await refreshData();
      setStatus(editingId ? "Transazione aggiornata" : "Transazione salvata");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(transaction: TransactionRow) {
    setEditingId(transaction.id);
    setActiveTab("new-transaction");
    setTransactionForm({
      tx_date: transaction.tx_date,
      description: transaction.description,
      amount: Number(transaction.amount).toFixed(2),
      tx_type: transaction.tx_type,
      category: transaction.category,
    });
    setStatus("Modalita modifica attiva");
  }

  function cancelEdit() {
    setEditingId(null);
    setTransactionForm({
      tx_date: new Date().toISOString().slice(0, 10),
      description: "",
      amount: "",
      tx_type: "expense",
      category: categories[0]?.name ?? "",
    });
    setStatus("Modifica annullata");
  }

  async function removeTransaction(id: string) {
    setLoading(true);
    setStatus("Eliminazione in corso...");

    try {
      await invoke("delete_transaction", { id });
      await refreshData();
      setStatus("Transazione eliminata");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveScheduledExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!scheduledForm.category) {
      setStatus("Seleziona una categoria per la pianificazione");
      return;
    }

    setLoading(true);
    setStatus("Salvataggio pianificazione in corso...");

    try {
      await invoke<ScheduledExpenseRow>("create_scheduled_expense", {
        input: scheduledForm,
      });

      setScheduledForm({
        due_date: new Date().toISOString().slice(0, 10),
        description: "",
        amount: "",
        tx_type: "expense",
        category: categories[0]?.name ?? "",
        frequency: "monthly",
      });
      await refreshData();
      setStatus("Pianificazione salvata");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function removeScheduledExpense(id: string) {
    setLoading(true);
    setStatus("Eliminazione pianificazione in corso...");

    try {
      await invoke("delete_scheduled_expense", { id });
      await refreshData();
      setStatus("Pianificazione eliminata");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("Creazione categoria in corso...");

    try {
      await invoke<CategoryRow>("create_category", { input: categoryForm });
      setCategoryForm({ name: "", color: categoryForm.color });
      await refreshData();
      setStatus("Categoria creata");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!budgetForm.category) {
      setStatus("Seleziona una categoria per il budget");
      return;
    }

    setLoading(true);
    setStatus("Salvataggio budget in corso...");

    try {
      await invoke<BudgetRow>("upsert_category_budget", {
        input: {
          category: budgetForm.category,
          month: budgetForm.month,
          amount: budgetForm.amount,
        },
      });

      setBudgetForm((current) => ({ ...current, amount: "" }));
      await refreshData();
      setStatus("Budget salvato");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function removeBudget(id: string) {
    setLoading(true);
    setStatus("Eliminazione budget in corso...");

    try {
      await invoke("delete_category_budget", { id });
      await refreshData();
      setStatus("Budget eliminato");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveSavingsGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setStatus("Salvataggio obiettivo risparmio in corso...");

    try {
      await invoke<SavingsGoalRow>("upsert_monthly_savings_goal", {
        input: {
          month: savingsGoalForm.month,
          amount: savingsGoalForm.amount,
        },
      });

      setSavingsGoalForm((current) => ({ ...current, amount: "" }));
      await refreshData();
      setStatus("Obiettivo risparmio salvato");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function removeSavingsGoal(id: string) {
    setLoading(true);
    setStatus("Eliminazione obiettivo risparmio in corso...");

    try {
      await invoke("delete_monthly_savings_goal", { id });
      await refreshData();
      setStatus("Obiettivo risparmio eliminato");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function removeCategory(id: string) {
    setLoading(true);
    setStatus("Eliminazione categoria in corso...");

    try {
      await invoke("delete_category", { id });
      await refreshData();
      setStatus("Categoria eliminata");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <header className="hero hero-wide">
        <p className="eyebrow">Finanza Personale Locale</p>
        <div className="hero-title-row">
          <img src={logoImg} alt="Capra Logo" className="logo-icon" />
          <h1>Conti Caprino</h1>
        </div>
        <p className="subtitle">Gestionale personale per monitorare movimenti, pianificazioni e analisi in locale.</p>
      </header>

      <section className="panel panel-wide">
        <div className="tabs-row main-nav">
          <button
            type="button"
            className={activeTab === "home" ? "tab-button tab-active" : "tab-button"}
            onClick={() => setActiveTab("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={activeTab === "new-transaction" ? "tab-button tab-active" : "tab-button"}
            onClick={() => setActiveTab("new-transaction")}
          >
            Nuovo Movimento
          </button>
          <button
            type="button"
            className={activeTab === "scheduled" ? "tab-button tab-active" : "tab-button"}
            onClick={() => setActiveTab("scheduled")}
          >
            Programmate
          </button>
          <button
            type="button"
            className={activeTab === "analysis" ? "tab-button tab-active" : "tab-button"}
            onClick={() => setActiveTab("analysis")}
          >
            Analisi
          </button>
          <button
            type="button"
            className={activeTab === "categories" ? "tab-button tab-active" : "tab-button"}
            onClick={() => setActiveTab("categories")}
          >
            Categorie
          </button>
        </div>

        {activeTab === "home" && (
          <div className="section-card">
            <div className="home-top-grid">
              <article className="home-balance-card">
                <span>Saldo Disponibile</span>
                <strong>€ {totalSummary.balance.toFixed(2)}</strong>
                <p>
                  Entrate totali € {totalSummary.income.toFixed(2)} · Uscite totali € {totalSummary.expense.toFixed(2)}
                </p>
              </article>

              <article className="home-last-card">
                <span>Ultima Transazione</span>
                {latestTransaction ? (
                  <>
                    <strong>{latestTransaction.description}</strong>
                    <p>
                      {latestTransaction.tx_date} · {latestTransaction.category} · {latestTransaction.tx_type}
                    </p>
                    <div className={latestTransaction.tx_type === "income" ? "amount income" : "amount expense"}>
                      {latestTransaction.tx_type === "income" ? "+" : "-"}€ {Number(latestTransaction.amount).toFixed(2)}
                    </div>
                  </>
                ) : (
                  <p>Nessuna transazione inserita.</p>
                )}
              </article>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">Mese Corrente</span>
                <strong>{currentMonth}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Saldo Mese Corrente</span>
                <strong>€ {homeSummary.balance.toFixed(2)}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Entrate Mese Corrente</span>
                <strong className="income">€ {homeSummary.income.toFixed(2)}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Uscite Mese Corrente</span>
                <strong className="expense">€ {homeSummary.expense.toFixed(2)}</strong>
              </div>
            </div>

            {currentMonthBudgetAlerts.length > 0 && (
              <div className="budget-alerts">
                {currentMonthBudgetAlerts.map((item) => (
                    <article className="budget-alert-card" key={item.id}>
                      <strong>Budget superato: {item.category}</strong>
                      <p>
                        Speso € {item.spent.toFixed(2)} su limite € {item.limit.toFixed(2)} nel mese {currentMonth}
                      </p>
                    </article>
                  ))}
              </div>
            )}

            {homeGoalProgress && (
              <section className="goal-card">
                <div className="goal-head">
                  <h3>Obiettivo Risparmio {currentMonth}</h3>
                  <strong className={homeGoalProgress.isReached ? "income" : "expense"}>
                    {homeGoalProgress.isReached ? "Raggiunto" : "In corso"}
                  </strong>
                </div>
                <p>
                  Obiettivo € {homeGoalProgress.goal.toFixed(2)} · Saldo attuale € {homeGoalProgress.achieved.toFixed(2)}
                </p>
                <div className="budget-progress-track">
                  <div
                    className={homeGoalProgress.isReached ? "budget-progress-fill budget-safe" : "budget-progress-fill budget-warning"}
                    style={{ width: `${Math.min(Math.max(homeGoalProgress.progress, 0), 100)}%` }}
                  />
                </div>
                <p className={homeGoalProgress.remaining <= 0 ? "income" : "expense"}>
                  {homeGoalProgress.remaining <= 0
                    ? `Hai superato l'obiettivo di € ${Math.abs(homeGoalProgress.remaining).toFixed(2)}`
                    : `Ti mancano € ${homeGoalProgress.remaining.toFixed(2)} per raggiungerlo`}
                </p>
              </section>
            )}

            <div className="charts-grid charts-grid-wide">
              <section className="chart-card pie-card">
                <div className="chart-head">
                  <div>
                    <h3>Uscite per Categoria</h3>
                    <p>Solo mese corrente</p>
                  </div>
                  <strong>€ {homeExpensePieChart.total.toFixed(2)}</strong>
                </div>

                <div className="pie-wrap">
                  <div
                    className="pie-chart"
                    style={{
                      background:
                        homeExpensePieChart.total > 0
                          ? `conic-gradient(${homeExpensePieChart.rows
                              .map((row) => `${row.color} ${row.start}deg ${row.end}deg`)
                              .join(", ")})`
                          : "linear-gradient(135deg, rgba(242, 166, 90, 0.22), rgba(131, 205, 177, 0.2))",
                    }}
                  >
                    <div className="pie-hole">
                      <span>Spese</span>
                      <strong>€ {homeExpensePieChart.total.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="pie-legend">
                    {homeExpensePieChart.rows.map((row) => (
                      <div key={row.category} className="pie-legend-row">
                        <span className="color-dot" style={{ background: row.color }} />
                        <span>{row.category}</span>
                        <strong>€ {row.total.toFixed(2)}</strong>
                      </div>
                    ))}
                    {homeExpensePieChart.rows.length === 0 && <p className="empty-chart">Nessuna uscita nel mese corrente.</p>}
                  </div>
                </div>
              </section>

              <section className="chart-card pie-card">
                <div className="chart-head">
                  <div>
                    <h3>Entrate per Categoria</h3>
                    <p>Solo mese corrente</p>
                  </div>
                  <strong>€ {homeIncomePieChart.total.toFixed(2)}</strong>
                </div>

                <div className="pie-wrap">
                  <div
                    className="pie-chart"
                    style={{
                      background:
                        homeIncomePieChart.total > 0
                          ? `conic-gradient(${homeIncomePieChart.rows
                              .map((row) => `${row.color} ${row.start}deg ${row.end}deg`)
                              .join(", ")})`
                          : "linear-gradient(135deg, rgba(131, 205, 177, 0.22), rgba(242, 166, 90, 0.18))",
                    }}
                  >
                    <div className="pie-hole">
                      <span>Entrate</span>
                      <strong>€ {homeIncomePieChart.total.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="pie-legend">
                    {homeIncomePieChart.rows.map((row) => (
                      <div key={row.category} className="pie-legend-row">
                        <span className="color-dot" style={{ background: row.color }} />
                        <span>{row.category}</span>
                        <strong>€ {row.total.toFixed(2)}</strong>
                      </div>
                    ))}
                    {homeIncomePieChart.rows.length === 0 && <p className="empty-chart">Nessuna entrata nel mese corrente.</p>}
                  </div>
                </div>
              </section>

              <section className="chart-card day-card">
                <div className="chart-head">
                  <div>
                    <h3>Andamento del Mese</h3>
                    <p>Saldo cumulato del mese corrente con aumenti e diminuzioni</p>
                  </div>
                  <strong>Saldo mese</strong>
                </div>

                {homeTrendView.points.length > 0 && (
                  <div className="trend-chart-wrap">
                    <svg className="trend-chart" viewBox="0 0 720 210" preserveAspectRatio="none" role="img" aria-label="Andamento saldo mese corrente">
                      <defs>
                        <linearGradient id="trendFillHome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(242, 166, 90, 0.35)" />
                          <stop offset="100%" stopColor="rgba(242, 166, 90, 0.02)" />
                        </linearGradient>
                      </defs>
                      <line x1="18" y1={homeTrendView.zeroY} x2="702" y2={homeTrendView.zeroY} className="trend-zero-line" />
                      <path d={homeTrendView.areaPath} fill="url(#trendFillHome)" />
                      <path d={homeTrendView.linePath} className="trend-line" />
                      {homeTrendView.points.map((point) => (
                        <circle
                          key={point.day}
                          cx={point.x}
                          cy={point.y}
                          r={point.day === homeSelectedDay ? 4 : 2.5}
                          className={point.day === homeSelectedDay ? "trend-point trend-point-selected" : "trend-point"}
                        />
                      ))}
                    </svg>

                    <div className="trend-metrics">
                      <div className="trend-metric">
                        <span>Saldo Finale</span>
                        <strong className={homeTrendView.latestBalance >= 0 ? "income" : "expense"}>
                          € {homeTrendView.latestBalance.toFixed(2)}
                        </strong>
                      </div>
                      <div className="trend-metric">
                        <span>Aumenti Mese</span>
                        <strong className="income">+€ {homeTrendView.totalIncrease.toFixed(2)}</strong>
                      </div>
                      <div className="trend-metric">
                        <span>Diminuzioni Mese</span>
                        <strong className="expense">-€ {homeTrendView.totalDecrease.toFixed(2)}</strong>
                      </div>
                      {homeTrendView.selectedPoint && (
                        <div className="trend-metric trend-metric-wide">
                          <span>Giorno {homeTrendView.selectedPoint.day}</span>
                          <strong className={homeTrendView.selectedPoint.dailyNet >= 0 ? "income" : "expense"}>
                            Delta {homeTrendView.selectedPoint.dailyNet >= 0 ? "+" : ""}€ {homeTrendView.selectedPoint.dailyNet.toFixed(2)}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {homeTrendView.points.length === 0 && <p className="empty-chart">Nessun dato disponibile nel mese corrente.</p>}
              </section>
            </div>
          </div>
        )}

        {activeTab === "new-transaction" && (
          <div className="section-card">
            <div className="section-head">
              <h2>{editingId ? "Modifica movimento" : "Nuovo movimento"}</h2>
              {editingId && (
                <button type="button" onClick={cancelEdit} disabled={loading}>
                  Annulla modifica
                </button>
              )}
            </div>

            <form className="form" onSubmit={saveTransaction}>
              <div className="field-grid">
                <label>
                  Data
                  <input
                    type="date"
                    value={transactionForm.tx_date}
                    onChange={(event) => setTransactionForm({ ...transactionForm, tx_date: event.target.value })}
                  />
                </label>
                <label>
                  Importo
                  <div className="currency-input">
                    <span className="currency-symbol">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={transactionForm.amount}
                      onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </label>
                <label>
                  Tipo
                  <select
                    value={transactionForm.tx_type}
                    onChange={(event) =>
                      setTransactionForm({ ...transactionForm, tx_type: event.target.value as TransactionType })
                    }
                  >
                    <option value="expense">Uscita</option>
                    <option value="income">Entrata</option>
                  </select>
                </label>
                <label>
                  Categoria
                  <div
                    className="category-select-wrap"
                    style={{ ["--category-color" as string]: selectedTransactionCategoryColor } as React.CSSProperties}
                  >
                    <span className="color-dot category-select-dot" style={{ background: selectedTransactionCategoryColor }} />
                    <select
                      value={transactionForm.category}
                      onChange={(event) => setTransactionForm({ ...transactionForm, category: event.target.value })}
                    >
                      <option value="">Seleziona categoria</option>
                      {categoryNames.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>

              <label>
                Descrizione
                <input
                  type="text"
                  value={transactionForm.description}
                  onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })}
                  placeholder="Pagamento bolletta, stipendio, benzina..."
                />
              </label>

              <div className="row row-actions">
                <button type="submit" disabled={loading}>
                  {editingId ? "Salva modifica" : "Salva movimento"}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === "scheduled" && (
          <div className="section-card">
            <div className="section-head">
              <h2>Nuova pianificazione</h2>
            </div>

            <form className="form" onSubmit={saveScheduledExpense}>
              <div className="field-grid">
                <label>
                  Scadenza
                  <input
                    type="date"
                    value={scheduledForm.due_date}
                    onChange={(event) => setScheduledForm({ ...scheduledForm, due_date: event.target.value })}
                  />
                </label>
                <label>
                  Importo
                  <div className="currency-input">
                    <span className="currency-symbol">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={scheduledForm.amount}
                      onChange={(event) => setScheduledForm({ ...scheduledForm, amount: event.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </label>
                <label>
                  Tipo
                  <select
                    value={scheduledForm.tx_type}
                    onChange={(event) =>
                      setScheduledForm({ ...scheduledForm, tx_type: event.target.value as TransactionType })
                    }
                  >
                    <option value="expense">Uscita</option>
                    <option value="income">Entrata</option>
                  </select>
                </label>
                <label>
                  Categoria
                  <div
                    className="category-select-wrap"
                    style={{ ["--category-color" as string]: selectedScheduledCategoryColor } as React.CSSProperties}
                  >
                    <span className="color-dot category-select-dot" style={{ background: selectedScheduledCategoryColor }} />
                    <select
                      value={scheduledForm.category}
                      onChange={(event) => setScheduledForm({ ...scheduledForm, category: event.target.value })}
                    >
                      <option value="">Seleziona categoria</option>
                      {categoryNames.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label>
                  Frequenza
                  <select
                    value={scheduledForm.frequency}
                    onChange={(event) =>
                      setScheduledForm({ ...scheduledForm, frequency: event.target.value as ScheduledFrequency })
                    }
                  >
                    <option value="once">Una volta</option>
                    <option value="weekly">Settimanale</option>
                    <option value="monthly">Mensile</option>
                    <option value="yearly">Annuale</option>
                  </select>
                </label>
              </div>

              <label>
                Descrizione
                <input
                  type="text"
                  value={scheduledForm.description}
                  onChange={(event) => setScheduledForm({ ...scheduledForm, description: event.target.value })}
                  placeholder="Es. Affitto, stipendio, palestra..."
                />
              </label>

              <div className="row row-actions">
                <button type="submit" disabled={loading}>
                  Salva pianificazione
                </button>
              </div>
            </form>

            <div className="transactions-list">
              {scheduledExpenses.map((expense) => (
                <article className="transaction-card" key={expense.id}>
                  <div>
                    <strong>{expense.description}</strong>
                    <p>
                      Scadenza {expense.due_date} · {expense.category} · {expense.frequency} · {expense.tx_type}
                    </p>
                  </div>
                  <div className={expense.tx_type === "income" ? "amount income" : "amount expense"}>
                    {expense.tx_type === "income" ? "+" : "-"}€ {Number(expense.amount).toFixed(2)}
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={loading}
                    onClick={() => {
                      const confirmed = window.confirm("Eliminare questa pianificazione?");
                      if (confirmed) {
                        void removeScheduledExpense(expense.id);
                      }
                    }}
                  >
                    Elimina
                  </button>
                </article>
              ))}
              {scheduledExpenses.length === 0 && (
                <article className="transaction-card empty-state">Nessuna pianificazione presente.</article>
              )}
            </div>
          </div>
        )}

        {activeTab === "analysis" && (
          <div className="section-card">
            <div className="filters-grid filters-top">
              <label>
                Mese
                <input
                  type="month"
                  value={filters.month}
                  onChange={(event) => setFilters({ ...filters, month: event.target.value })}
                />
              </label>
              <label>
                Giorno
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={filters.day}
                  onChange={(event) => setFilters({ ...filters, day: event.target.value })}
                />
              </label>
              <label>
                Tipo
                <select
                  value={filters.tx_type}
                  onChange={(event) => setFilters({ ...filters, tx_type: event.target.value as Filters["tx_type"] })}
                >
                  <option value="all">Tutti</option>
                  <option value="expense">Uscite</option>
                  <option value="income">Entrate</option>
                </select>
              </label>
              <label>
                Categoria
                <div
                  className="category-select-wrap"
                  style={{ ["--category-color" as string]: selectedFilterCategoryColor } as React.CSSProperties}
                >
                  <span className="color-dot category-select-dot" style={{ background: selectedFilterCategoryColor }} />
                  <select
                    value={filters.category}
                    onChange={(event) => setFilters({ ...filters, category: event.target.value })}
                  >
                    <option value="all">Tutte</option>
                    {categoryNames.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                Cerca
                <input
                  type="text"
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder="Descrizione o categoria"
                />
              </label>
              <button type="button" onClick={resetFilters} disabled={loading}>
                Reset filtri
              </button>
              <button
                type="button"
                onClick={() => setShowAllAnalysisBudgets((current) => !current)}
                disabled={loading}
              >
                {showAllAnalysisBudgets ? "Mostra solo budget mese selezionato" : "Mostra tutti i budget"}
              </button>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">Saldo Totale</span>
                <strong>€ {filteredSummary.balance.toFixed(2)}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Movimenti Filtrati</span>
                <strong>{filteredTransactions.length}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Entrate Filtrate</span>
                <strong className="income">€ {filteredSummary.income.toFixed(2)}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Uscite Filtrate</span>
                <strong className="expense">€ {filteredSummary.expense.toFixed(2)}</strong>
              </div>
              {analysisMonthSavingsGoal && (
                <div className="summary-card">
                  <span className="summary-label">Obiettivo Risparmio {analysisMonth}</span>
                  <strong>€ {Number(analysisMonthSavingsGoal.goal_amount).toFixed(2)}</strong>
                </div>
              )}
            </div>

            <section className="section-card budget-analysis-card">
              <div className="section-head">
                <h3>Budget in Analisi</h3>
                <span>{showAllAnalysisBudgets ? "Vista: tutti i mesi" : `Vista: ${analysisMonth}`}</span>
              </div>

              <div className="transactions-list">
                {analysisBudgetRows.map((item) => {
                  const barWidth = Math.min(item.progress, 100);
                  const barClass = item.progress >= 100 ? "budget-progress-fill budget-over" : item.progress >= 80 ? "budget-progress-fill budget-warning" : "budget-progress-fill budget-safe";

                  return (
                    <article className="transaction-card budget-card" key={`analysis-${item.id}`}>
                      <div>
                        <strong>{item.category} · {item.month}</strong>
                        <p>
                          Limite € {item.limit.toFixed(2)} · Speso € {item.spent.toFixed(2)} · Residuo € {item.remaining.toFixed(2)}
                        </p>
                        <div className="budget-progress-track">
                          <div className={barClass} style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>
                    </article>
                  );
                })}
                {analysisBudgetRows.length === 0 && (
                  <article className="transaction-card empty-state">Nessun budget disponibile per questa vista.</article>
                )}
              </div>
            </section>

            <div className="charts-grid charts-grid-wide">
              <section className="chart-card pie-card">
                <div className="chart-head">
                  <div>
                    <h3>Uscite per Categoria</h3>
                    <p>Distribuzione delle spese nel filtro attuale</p>
                  </div>
                  <strong>€ {analysisExpensePieChart.total.toFixed(2)}</strong>
                </div>

                <div className="pie-wrap">
                  <div
                    className="pie-chart"
                    style={{
                      background:
                        analysisExpensePieChart.total > 0
                          ? `conic-gradient(${analysisExpensePieChart.rows
                              .map((row) => `${row.color} ${row.start}deg ${row.end}deg`)
                              .join(", ")})`
                          : "linear-gradient(135deg, rgba(242, 166, 90, 0.22), rgba(131, 205, 177, 0.2))",
                    }}
                  >
                    <div className="pie-hole">
                      <span>Spese</span>
                      <strong>€ {analysisExpensePieChart.total.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="pie-legend">
                    {analysisExpensePieChart.rows.map((row) => (
                      <div key={row.category} className="pie-legend-row">
                        <span className="color-dot" style={{ background: row.color }} />
                        <span>{row.category}</span>
                        <strong>€ {row.total.toFixed(2)}</strong>
                      </div>
                    ))}
                    {analysisExpensePieChart.rows.length === 0 && <p className="empty-chart">Nessuna uscita nel filtro corrente.</p>}
                  </div>
                </div>
              </section>

              <section className="chart-card pie-card">
                <div className="chart-head">
                  <div>
                    <h3>Entrate per Categoria</h3>
                    <p>Distribuzione delle entrate nel filtro attuale</p>
                  </div>
                  <strong>€ {analysisIncomePieChart.total.toFixed(2)}</strong>
                </div>

                <div className="pie-wrap">
                  <div
                    className="pie-chart"
                    style={{
                      background:
                        analysisIncomePieChart.total > 0
                          ? `conic-gradient(${analysisIncomePieChart.rows
                              .map((row) => `${row.color} ${row.start}deg ${row.end}deg`)
                              .join(", ")})`
                          : "linear-gradient(135deg, rgba(131, 205, 177, 0.22), rgba(242, 166, 90, 0.18))",
                    }}
                  >
                    <div className="pie-hole">
                      <span>Entrate</span>
                      <strong>€ {analysisIncomePieChart.total.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="pie-legend">
                    {analysisIncomePieChart.rows.map((row) => (
                      <div key={row.category} className="pie-legend-row">
                        <span className="color-dot" style={{ background: row.color }} />
                        <span>{row.category}</span>
                        <strong>€ {row.total.toFixed(2)}</strong>
                      </div>
                    ))}
                    {analysisIncomePieChart.rows.length === 0 && <p className="empty-chart">Nessuna entrata nel filtro corrente.</p>}
                  </div>
                </div>
              </section>

              <section className="chart-card day-card">
                <div className="chart-head">
                  <div>
                    <h3>Andamento del Mese</h3>
                    <p>Mese {analysisMonth} · saldo cumulato con aumenti e diminuzioni</p>
                  </div>
                  <strong>Saldo mese</strong>
                </div>

                {analysisTrendView.points.length > 0 && (
                  <div className="trend-chart-wrap">
                    <svg className="trend-chart" viewBox="0 0 720 210" preserveAspectRatio="none" role="img" aria-label="Andamento saldo mese selezionato">
                      <defs>
                        <linearGradient id="trendFillAnalysis" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(242, 166, 90, 0.35)" />
                          <stop offset="100%" stopColor="rgba(242, 166, 90, 0.02)" />
                        </linearGradient>
                      </defs>
                      <line x1="18" y1={analysisTrendView.zeroY} x2="702" y2={analysisTrendView.zeroY} className="trend-zero-line" />
                      <path d={analysisTrendView.areaPath} fill="url(#trendFillAnalysis)" />
                      <path d={analysisTrendView.linePath} className="trend-line" />
                      {analysisTrendView.points.map((point) => (
                        <circle
                          key={point.day}
                          cx={point.x}
                          cy={point.y}
                          r={point.day === analysisSelectedDay ? 4 : 2.5}
                          className={point.day === analysisSelectedDay ? "trend-point trend-point-selected" : "trend-point"}
                        />
                      ))}
                    </svg>

                    <div className="trend-metrics">
                      <div className="trend-metric">
                        <span>Saldo Finale</span>
                        <strong className={analysisTrendView.latestBalance >= 0 ? "income" : "expense"}>
                          € {analysisTrendView.latestBalance.toFixed(2)}
                        </strong>
                      </div>
                      <div className="trend-metric">
                        <span>Aumenti Mese</span>
                        <strong className="income">+€ {analysisTrendView.totalIncrease.toFixed(2)}</strong>
                      </div>
                      <div className="trend-metric">
                        <span>Diminuzioni Mese</span>
                        <strong className="expense">-€ {analysisTrendView.totalDecrease.toFixed(2)}</strong>
                      </div>
                      {analysisTrendView.selectedPoint && (
                        <div className="trend-metric trend-metric-wide">
                          <span>Giorno {analysisTrendView.selectedPoint.day}</span>
                          <strong className={analysisTrendView.selectedPoint.dailyNet >= 0 ? "income" : "expense"}>
                            Delta {analysisTrendView.selectedPoint.dailyNet >= 0 ? "+" : ""}€ {analysisTrendView.selectedPoint.dailyNet.toFixed(2)}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {analysisTrendView.points.length === 0 && <p className="empty-chart">Nessun dato nel mese selezionato.</p>}
              </section>
            </div>

            <div className="transactions-list">
              {filteredTransactions.map((transaction) => (
                <article className="transaction-card" key={transaction.id}>
                  <div>
                    <strong>{transaction.description}</strong>
                    <p>
                      {transaction.tx_date} · {transaction.category} · {transaction.tx_type}
                    </p>
                  </div>
                  <div className={transaction.tx_type === "income" ? "amount income" : "amount expense"}>
                    {transaction.tx_type === "income" ? "+" : "-"}€ {Number(transaction.amount).toFixed(2)}
                  </div>
                  <button type="button" disabled={loading} onClick={() => beginEdit(transaction)}>
                    Modifica
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={loading}
                    onClick={() => {
                      const confirmed = window.confirm("Vuoi davvero eliminare questo movimento?");
                      if (confirmed) {
                        void removeTransaction(transaction.id);
                      }
                    }}
                  >
                    Elimina
                  </button>
                </article>
              ))}
              {filteredTransactions.length === 0 && (
                <article className="transaction-card empty-state">Nessun movimento trovato con i filtri attuali.</article>
              )}
            </div>
          </div>
        )}

        {activeTab === "categories" && (
          <div className="categories-layout">
            <div className="section-card categories-panel">
              <div className="section-head">
                <h2>Categorie</h2>
                <button type="button" onClick={refreshData} disabled={loading}>
                  Ricarica categorie
                </button>
              </div>

              <form className="form" onSubmit={saveCategory}>
                <div className="field-grid">
                  <label>
                    Nome categoria
                    <input
                      type="text"
                      value={categoryForm.name}
                      onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                      placeholder="Es. Alimentari"
                    />
                  </label>
                  <label>
                    Colore
                    <input
                      type="color"
                      value={categoryForm.color}
                      onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
                    />
                  </label>
                </div>

                <div className="row row-actions">
                  <button type="submit" disabled={loading}>
                    Aggiungi categoria
                  </button>
                </div>
              </form>
            </div>

            <div className="section-card categories-panel">
              <div className="section-head">
                <h2>Budget Mensile Categoria</h2>
              </div>

              <form className="form" onSubmit={saveBudget}>
                <div className="field-grid">
                  <label>
                    Categoria
                    <div
                      className="category-select-wrap"
                      style={{
                        ["--category-color" as string]:
                          budgetForm.category ? (categoryColorByName.get(budgetForm.category) ?? "#F2A65A") : "#F2A65A",
                      } as React.CSSProperties}
                    >
                      <span
                        className="color-dot category-select-dot"
                        style={{ background: budgetForm.category ? (categoryColorByName.get(budgetForm.category) ?? "#F2A65A") : "#F2A65A" }}
                      />
                      <select
                        value={budgetForm.category}
                        onChange={(event) => setBudgetForm({ ...budgetForm, category: event.target.value })}
                      >
                        <option value="">Seleziona categoria</option>
                        {categoryNames.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label>
                    Mese
                    <input
                      type="month"
                      value={budgetForm.month}
                      onChange={(event) => setBudgetForm({ ...budgetForm, month: event.target.value })}
                    />
                  </label>

                  <label>
                    Budget limite
                    <div className="currency-input">
                      <span className="currency-symbol">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={budgetForm.amount}
                        onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </label>
                </div>

                <div className="row row-actions">
                  <button type="submit" disabled={loading}>
                    Salva budget
                  </button>
                </div>
              </form>
            </div>

            <div className="section-card categories-panel">
              <div className="section-head">
                <h2>Obiettivo Risparmio Mensile</h2>
              </div>

              <form className="form" onSubmit={saveSavingsGoal}>
                <div className="field-grid">
                  <label>
                    Mese
                    <input
                      type="month"
                      value={savingsGoalForm.month}
                      onChange={(event) => setSavingsGoalForm({ ...savingsGoalForm, month: event.target.value })}
                    />
                  </label>

                  <label>
                    Obiettivo
                    <div className="currency-input">
                      <span className="currency-symbol">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={savingsGoalForm.amount}
                        onChange={(event) => setSavingsGoalForm({ ...savingsGoalForm, amount: event.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </label>
                </div>

                <div className="row row-actions">
                  <button type="submit" disabled={loading}>
                    Salva obiettivo
                  </button>
                </div>
              </form>
            </div>

            <div className="transactions-list">
              {budgetUsageRows.map((item) => {
                const barWidth = Math.min(item.progress, 100);
                const barClass = item.progress >= 100 ? "budget-progress-fill budget-over" : item.progress >= 80 ? "budget-progress-fill budget-warning" : "budget-progress-fill budget-safe";
                return (
                  <article className="transaction-card budget-card" key={item.id}>
                    <div>
                      <strong>Budget {item.category} · {item.month}</strong>
                      <p>
                        Limite € {item.limit.toFixed(2)} · Speso € {item.spent.toFixed(2)} · Residuo € {item.remaining.toFixed(2)}
                      </p>
                      <div className="budget-progress-track">
                        <div className={barClass} style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={loading}
                      onClick={() => {
                        const confirmed = window.confirm(`Eliminare budget ${item.category} ${item.month}?`);
                        if (confirmed) {
                          void removeBudget(item.id);
                        }
                      }}
                    >
                      Elimina budget
                    </button>
                  </article>
                );
              })}

              {savingsGoals.map((goal) => (
                <article className="transaction-card" key={goal.id}>
                  <div>
                    <strong>Obiettivo {goal.month}</strong>
                    <p>Risparmio target € {Number(goal.goal_amount).toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={loading}
                    onClick={() => {
                      const confirmed = window.confirm(`Eliminare obiettivo risparmio ${goal.month}?`);
                      if (confirmed) {
                        void removeSavingsGoal(goal.id);
                      }
                    }}
                  >
                    Elimina obiettivo
                  </button>
                </article>
              ))}

              {categories.map((category) => (
                <article className="transaction-card" key={category.id}>
                  <div className="category-item">
                    <span className="color-dot" style={{ background: category.color }} />
                    <strong>{category.name}</strong>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={loading}
                    onClick={() => {
                      const confirmed = window.confirm(`Eliminare categoria ${category.name}?`);
                      if (confirmed) {
                        void removeCategory(category.id);
                      }
                    }}
                  >
                    Elimina categoria
                  </button>
                </article>
              ))}

              {budgetUsageRows.length === 0 && (
                <article className="transaction-card empty-state">Nessun budget configurato.</article>
              )}
            </div>
          </div>
        )}

      </section>
    </main>
  );
}

export default App;
