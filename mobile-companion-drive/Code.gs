const PROP_CSV_FILE_ID = "CSV_FILE_ID";
const PROP_CATEGORIES_FILE_ID = "CATEGORIES_CSV_FILE_ID";

function doGet() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Conti Caprino Mobile</title>
    <style>
      :root {
        --bg0: #1a120d;
        --bg1: #281b14;
        --bg2: #3a291e;
        --panel: rgba(44, 31, 22, 0.9);
        --text: #f6e8d3;
        --muted: #d5bea0;
        --accent: #f2a65a;
        --good: #85d8b2;
        --bad: #ff9770;
        --border: rgba(255, 224, 190, 0.2);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Tahoma, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at 12% 12%, rgba(242, 166, 90, 0.25), transparent 30%),
          radial-gradient(circle at 86% 18%, rgba(131, 205, 177, 0.2), transparent 28%),
          linear-gradient(160deg, var(--bg0) 0%, var(--bg1) 48%, var(--bg2) 100%);
        padding: 18px;
      }

      .card {
        max-width: 720px;
        margin: 0 auto;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
      }

      h1 {
        margin: 0 0 4px;
        font-size: 1.6rem;
      }

      p {
        margin: 0;
        color: var(--muted);
      }

      form {
        margin-top: 16px;
        display: grid;
        gap: 12px;
      }

      .grid {
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr 1fr;
      }

      @media (max-width: 640px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }

      label {
        display: grid;
        gap: 6px;
        color: var(--text);
        font-size: 0.95rem;
      }

      input,
      select,
      button {
        font: inherit;
        border-radius: 12px;
        border: 1px solid var(--border);
        padding: 0.75rem 0.9rem;
      }

      input,
      select {
        background: rgba(255, 236, 210, 0.08);
        color: var(--text);
      }

      button {
        cursor: pointer;
        background: rgba(242, 166, 90, 0.24);
        color: var(--text);
      }

      button[disabled] {
        opacity: 0.7;
        cursor: progress;
      }

      .status {
        margin-top: 12px;
        border-radius: 12px;
        padding: 10px 12px;
        background: rgba(255, 236, 210, 0.08);
      }

      .ok {
        border: 1px solid rgba(133, 216, 178, 0.6);
        color: var(--good);
      }

      .err {
        border: 1px solid rgba(255, 151, 112, 0.7);
        color: var(--bad);
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Conti Caprino Mobile</h1>
      <p>Inserisci un movimento e salva direttamente nel CSV su Google Drive.</p>

      <form id="tx-form">
        <div class="grid">
          <label>
            Data
            <input type="date" id="tx_date" required />
          </label>

          <label>
            Tipo
            <select id="tx_type" required>
              <option value="expense">Uscita</option>
              <option value="income">Entrata</option>
            </select>
          </label>

          <label>
            Importo
            <input type="number" id="amount" min="0.01" step="0.01" inputmode="decimal" required />
          </label>

          <label>
            Categoria
            <input type="text" id="category" list="category-list" value="Generale" required />
            <datalist id="category-list"></datalist>
          </label>
        </div>

        <label>
          Descrizione
          <input type="text" id="description" placeholder="Es. Pranzo, stipendio, benzina" required />
        </label>

        <button type="submit" id="submit-btn">Aggiungi al CSV</button>
      </form>

      <div id="status" class="status">Pronto</div>
    </main>

    <script>
      const form = document.getElementById("tx-form");
      const submitBtn = document.getElementById("submit-btn");
      const statusEl = document.getElementById("status");
      const txDateEl = document.getElementById("tx_date");
      const categoryListEl = document.getElementById("category-list");
      txDateEl.value = new Date().toISOString().slice(0, 10);

      function setStatus(message, kind) {
        statusEl.textContent = message;
        statusEl.className = "status " + (kind || "");
      }

      function renderCategorySuggestions(categories) {
        categoryListEl.innerHTML = "";
        if (!Array.isArray(categories)) {
          return;
        }

        for (const category of categories) {
          const option = document.createElement("option");
          option.value = category;
          categoryListEl.appendChild(option);
        }
      }

      google.script.run
        .withSuccessHandler(function (categories) {
          renderCategorySuggestions(categories);
        })
        .withFailureHandler(function () {
          // Fallback silenzioso: input categoria resta manuale.
        })
        .listCategorySuggestions();

      form.addEventListener("submit", function (event) {
        event.preventDefault();

        submitBtn.disabled = true;
        setStatus("Salvataggio in corso...", "");

        const payload = {
          tx_date: document.getElementById("tx_date").value,
          description: document.getElementById("description").value,
          amount: document.getElementById("amount").value,
          tx_type: document.getElementById("tx_type").value,
          category: document.getElementById("category").value,
        };

        google.script.run
          .withSuccessHandler(function () {
            document.getElementById("description").value = "";
            document.getElementById("amount").value = "";
            setStatus("Movimento salvato nel CSV", "ok");
            submitBtn.disabled = false;
          })
          .withFailureHandler(function (error) {
            const message = error && error.message ? error.message : String(error);
            setStatus("Errore: " + message, "err");
            submitBtn.disabled = false;
          })
          .appendTransactionRow(payload);
      });
    </script>
  </body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle("Conti Caprino Mobile")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setCsvFileId(fileId) {
  if (!fileId || String(fileId).trim() === "") {
    throw new Error("fileId obbligatorio");
  }

  PropertiesService.getScriptProperties().setProperty(PROP_CSV_FILE_ID, String(fileId).trim());
  return "ok";
}

function setCategoriesFileId(fileId) {
  if (!fileId || String(fileId).trim() === "") {
    throw new Error("fileId obbligatorio");
  }

  PropertiesService.getScriptProperties().setProperty(PROP_CATEGORIES_FILE_ID, String(fileId).trim());
  return "ok";
}

function clearCategoriesFileId() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_CATEGORIES_FILE_ID);
  return "ok";
}

function listCategorySuggestions() {
  const suggestions = new Set(["Generale"]);

  const txCsv = readFileContentById_(getCsvFileId_());
  const txRows = parseCsvRows_(txCsv);
  if (txRows.length > 0) {
    const header = txRows[0].map(normalizeHeader_);
    const categoryIndex = header.indexOf("category");
    if (categoryIndex >= 0) {
      for (let index = 1; index < txRows.length; index += 1) {
        const row = txRows[index];
        const category = (row[categoryIndex] || "").trim();
        if (category) {
          suggestions.add(category);
        }
      }
    }
  }

  const categoriesFileId = PropertiesService.getScriptProperties().getProperty(PROP_CATEGORIES_FILE_ID);
  if (categoriesFileId) {
    const categoriesCsv = readFileContentById_(categoriesFileId);
    const categoriesRows = parseCsvRows_(categoriesCsv);
    for (let index = 0; index < categoriesRows.length; index += 1) {
      const firstCol = (categoriesRows[index][0] || "").trim();
      const normalized = firstCol.toLowerCase();
      if (!firstCol) {
        continue;
      }
      if (normalized === "name" || normalized === "category") {
        continue;
      }
      suggestions.add(firstCol);
    }
  }

  return Array.from(suggestions).sort((a, b) => a.localeCompare(b));
}

function appendTransactionRow(payload) {
  const tx = validatePayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const fileId = getCsvFileId_();
    const file = DriveApp.getFileById(fileId);
    const current = file.getBlob().getDataAsString("UTF-8");

    const header = "tx_date,description,amount,tx_type,category";
    const normalized = current.trim();
    const base = normalized ? normalized : header;

    const line = [
      tx.tx_date,
      escapeCsv_(tx.description),
      tx.amount,
      tx.tx_type,
      escapeCsv_(tx.category),
    ].join(",");

    const nextContent = base + "\n" + line + "\n";
    file.setContent(nextContent);

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload non valido");
  }

  const tx_date = String(payload.tx_date || "").trim();
  const description = String(payload.description || "").trim();
  const amountRaw = String(payload.amount || "").trim().replace(",", ".");
  const tx_type = String(payload.tx_type || "").trim().toLowerCase();
  const category = String(payload.category || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx_date)) {
    throw new Error("Data non valida: usa formato YYYY-MM-DD");
  }

  if (!description) {
    throw new Error("Descrizione obbligatoria");
  }

  if (!category) {
    throw new Error("Categoria obbligatoria");
  }

  if (tx_type !== "income" && tx_type !== "expense") {
    throw new Error("Tipo non valido: income o expense");
  }

  const amountNumber = Number(amountRaw);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    throw new Error("Importo non valido");
  }

  return {
    tx_date,
    description,
    amount: amountNumber.toFixed(2),
    tx_type,
    category,
  };
}

function getCsvFileId_() {
  const fileId = PropertiesService.getScriptProperties().getProperty(PROP_CSV_FILE_ID);
  if (!fileId) {
    throw new Error("CSV_FILE_ID non configurato. Esegui setCsvFileId(fileId) una volta.");
  }

  return fileId;
}

function escapeCsv_(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function readFileContentById_(fileId) {
  const file = DriveApp.getFileById(fileId);
  return file.getBlob().getDataAsString("UTF-8");
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase();
}

function parseCsvRows_(csvText) {
  const text = String(csvText || "").trim();
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows = [];
  for (const line of lines) {
    rows.push(parseCsvLine_(line));
  }

  return rows;
}

function parseCsvLine_(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = i + 1 < line.length ? line[i + 1] : "";

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}
