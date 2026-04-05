# 🐐 Conti Caprino - Personal Financial Manager

A lightweight, local-first financial management application for tracking transactions, budgets, savings goals, and recurring expenses. Built with React, TypeScript, Rust, and PostgreSQL.

## ✨ Features

- **Transaction Management**: Track income and expense transactions with categories and dates
- **Budget System**: Set monthly budget limits per category with color-coded progress indicators
  - 🟢 Safe (0-80% of budget)
  - 🟡 Warning (80-100% of budget)
  - 🔴 Over budget (>100%)
- **Savings Goals**: Define global monthly savings targets with progress tracking
- **Scheduled Expenses**: Create recurring expenses (weekly, monthly, yearly) that auto-generate transactions
- **Category Management**: Organize transactions with custom categories and color coding
- **CSV Import from Cloud**: Sync transactions automatically from Google Drive using a headless CSV approach
- **Analysis Dashboard**: View detailed breakdowns by category, month, and budget status
- **Responsive Design**: Works on desktop and tablet with warm, accessible color palette

## 🏗️ Architecture

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development server
- **CSS Custom Properties** for themable, maintainable styling
- **Tauri IPC** for backend communication

### Backend
- **Rust** with Tauri v2 framework
- **PostgreSQL** for persistent data storage
- **CSV Processing** for cloud sync (csv crate v1.3)
- **UUID** for record identification

### Database
5 core tables:
- `transactions` - Individual income/expense records
- `categories` - User-defined expense categories with colors
- `scheduled_expenses` - Recurring expense templates
- `category_budgets` - Monthly budget limits per category
- `monthly_savings_goals` - Global monthly savings targets

## 🚀 Setup & Installation

### Prerequisites
- Node.js 16+ 
- Rust 1.70+
- PostgreSQL 12+

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/francocco99/GestionaleFinanze.git
   cd gestionale-finanze
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your database connection and Google Drive path:
   ```env
   DATABASE_URL=postgres://user:password@localhost:5432/conti_caprino
   INBOX_CSV_PATH=/path/to/Google Drive/conti_caprino/inbox.csv
   ```

4. **Initialize database**
   ```bash
   psql -U postgres -d conti_caprino -f sql/schema.sql
   ```

5. **Start development server**
   ```bash
   npm run tauri dev
   ```

## 📊 Usage

### Adding Transactions
1. Open **Home** tab
2. Fill in transaction details (date, description, amount, type, category)
3. Click "Add Transaction"

### Setting Budgets
1. Go to **Categories** tab
2. Select a category and click "Set Budget"
3. Choose month and budget amount
4. Monitor progress in **Analysis** tab with color-coded indicators

### Savings Goals
1. Go to **Categories** tab → "Monthly Savings Goal" card
2. Enter target amount for current month
3. Track progress in **Home** tab

### Scheduled Expenses
1. Go to **Scheduled** tab
2. Click "New Scheduled Expense"
3. Set frequency (weekly, monthly, yearly)
4. System auto-generates transactions on due dates

## 🔄 CSV Cloud Sync (Google Drive)

### Setup

1. **Configure Google Drive Desktop sync** on your machine
   - Install [Google Drive for Desktop](https://www.google.com/drive/download/)
   - Sync a folder to your local machine (e.g., `C:\Users\yourname\Google Drive\conti_caprino`)

2. **Update .env**
   ```env
   INBOX_CSV_PATH=C:\Users\yourname\Google Drive\conti_caprino\inbox.csv
   ```

3. **Create inbox.csv** in the synced folder with header:
   ```csv
   tx_date,description,amount,tx_type,category
   ```

### Adding Transactions from Phone

1. **On your mobile device**:
   - Open Google Drive
   - Navigate to synced folder
   - Open `inbox.csv` with Google Sheets or Excel
   - Add new rows with transactions:
     ```
     2026-04-05,Lunch,12.50,expense,Casa
     2026-04-05,Salary,2000.00,income,Lavoro
     ```
   - Save changes (auto-syncs via Google Drive)

2. **Back on desktop**:
   - Open Conti Caprino app
   - Click "Refresh" or restart app
   - System automatically:
     - Downloads changes from Google Drive
     - Parses CSV
     - Deduplicates transactions
     - Imports new entries into database
     - Resets CSV file (clears imported rows)

### CSV Format

| Field | Format | Example |
|-------|--------|---------|
| `tx_date` | YYYY-MM-DD | 2026-04-05 |
| `description` | Any text | Lunch at restaurant |
| `amount` | Decimal, positive | 12.50 |
| `tx_type` | `income` or `expense` | expense |
| `category` | Existing category | Casa |

**Note**: Amounts must be positive. The system determines income/expense via `tx_type` field.

## 🎨 Theme

The application uses a warm, accessible color palette:
- **Primary**: Earth tones (browns, oranges)
- **Accent**: Teal highlights
- **Feedback**: Green (safe), Orange (warning), Red (alert)

All colors are defined as CSS custom properties in `src/App.css` for easy customization.

## 📁 Project Structure

```
gestionale-finanze/
├── src/
│   ├── App.tsx              # Main React component
│   ├── App.css              # Styling
│   ├── assets/              # Images & logos
│   └── main.tsx             # Entry point
├── src-tauri/               # Rust backend
│   ├── src/
│   │   └── lib.rs           # Backend commands & DB
│   └── Cargo.toml           # Rust dependencies
├── sql/
│   ├── schema.sql           # Database DDL
│   └── inbox_template.csv   # CSV structure example
├── public/                  # Static files
├── index.html               # HTML template
├── package.json             # Node dependencies
└── tauri.conf.json          # Tauri config
```

## 🔧 Development

### Build for Production
```bash
npm run tauri build
```

### Run Tests (TypeScript)
```bash
npm run type-check
```

### Database Schema
See `sql/schema.sql` for complete schema documentation with indices and constraints.

## 🐛 Troubleshooting

### CSV not importing
- Verify `INBOX_CSV_PATH` points to existing folder in `.env`
- Check file format: header row + valid CSV rows
- Ensure `tx_type` is exactly `income` or `expense`
- Amounts must be valid numbers (use `.` as decimal separator)

### Port/Connection errors
- Check PostgreSQL is running: `psql -U postgres`
- Verify database exists: `createdb conti_caprino`
- Confirm connection string in `.env`

### App doesn't reflect new transactions
- Transactions import only on app startup/refresh
- CSV file resets after successful import (expected behavior)
- Check status message in app UI for import count

## 📝 License

MIT License - Feel free to use, modify, and distribute.

## 🤝 Contributing

Contributions welcome! Areas for enhancement:
- Additional budget/savings goal filters
- Export reports (PDF/Excel)
- Mobile app companion
- Advanced analytics
- Multi-currency support

---

**Built with ❤️ for personal finance tracking**
