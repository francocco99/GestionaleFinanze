# Conti Caprino - Mobile Companion Drive

Questa e una mini app separata (Google Apps Script) che fa solo una cosa:
- inserire movimenti dal telefono
- scriverli direttamente nel CSV su Google Drive

In piu, ora puo suggerire categorie automaticamente.

## 1) Prerequisiti

- Un file CSV su Google Drive (puoi usare `sql/inbox_template.csv` come base).
- Un account Google.

Header CSV richiesto:

```csv
tx_date,description,amount,tx_type,category
```

## 2) Setup rapido (10 minuti)

1. Apri [script.google.com](https://script.google.com) e crea un nuovo progetto.
2. Copia il contenuto di `Code.gs` dentro il file principale del progetto.
3. Crea/aggiorna anche `appsscript.json` con quello presente qui.
4. Salva.
5. Prendi il file ID del CSV da Drive (dall'URL del file).
6. In Apps Script esegui una volta la funzione `setCsvFileId` passando il file ID.
   Esempio: apri editor e lancia `setCsvFileId("1AbC...")`.
7. Deploy:
   - Deploy > New deployment
   - Type: Web app
   - Execute as: Me
   - Who has access: Anyone with the link (o solo il tuo account)
8. Apri l'URL da telefono e aggiungi alla home.

## 3) Come funziona

- Ogni submit aggiunge una riga al CSV in Drive.
- Validazioni incluse:
  - data in formato `YYYY-MM-DD`
  - importo numerico > 0
  - tipo `income` o `expense`
  - descrizione e categoria obbligatorie
- La categoria usa suggerimenti automatici:
   - sempre da `CSV_FILE_ID` (categorie gia presenti nei movimenti)
   - opzionale da un secondo CSV categorie (`CATEGORIES_CSV_FILE_ID`)

## 3.1) Sync categorie completo (opzionale ma consigliato)

Se vuoi evitare categoria manuale e avere elenco coerente col desktop:

1. Crea un file CSV categorie su Drive, per esempio `categories_mobile.csv`.
2. Metti una categoria per riga nella prima colonna.

Esempio valido:

```csv
name
Generale
Casa
Trasporti
Svago
```

3. Prendi l'ID del file categorie da Drive.
4. In Apps Script configura la property:
    - Key: `CATEGORIES_CSV_FILE_ID`
    - Value: ID del file categorie

Oppure da editor esegui una volta:
- `setCategoriesFileId("<ID_FILE_CATEGORIE>")`

Per disattivarla:
- `clearCategoriesFileId()`

## 4) Uso con la tua app desktop

1. Dal desktop continua ad avere `INBOX_CSV_PATH` puntato al file locale sincronizzato con Drive.
2. Sul telefono aggiungi movimenti nella web app.
3. Drive sincronizza il CSV.
4. Aprendo la desktop app, la tua funzione `sync_transactions_from_csv_inbox` importa le nuove righe.

## 5) Nota importante

Google Apps Script non puo modificare un file CSV locale del PC.
Deve scrivere su un file in Google Drive. La sincronizzazione locale la fa Google Drive desktop.
