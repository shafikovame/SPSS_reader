# SPSS Viewer (Private, Fidelity-First)

Веб-приложение для приватного просмотра `.sav` файлов SPSS без аналитики и без интерпретаций.  
Приложение отображает только фактические данные и метаданные, прочитанные через `pyreadstat`.

## Что делает

- Загружает только `.sav`
- Показывает Data View:
  - строки = cases
  - столбцы = переменные
  - переключатель `Values / Labels`
  - поиск по переменным
  - фильтр по номеру строки
- Показывает Variable View:
  - Имя
  - Тип
  - Метка
  - Значения
  - Пропущенные
  - Шкала
- Любая недоступная metadata показывается как пусто или `Unknown`

## Ограничения Viewer

- Нет статистики, графиков, аналитики, преобразований и редактирования
- Нет внешних API, AI-сервисов, LLM, интернет-обработки данных
- Нет реконструкции, интерполяции, авто-исправлений
- Источник истины только `.sav`

## Стек

- Backend: `FastAPI`, `pyreadstat`, `pandas`
- Frontend: `React`, `TypeScript`, `Vite`, `Tailwind CSS`
- Деплой: `Railway` (single service)

## Структура

```text
SPSSViewer/
├─ backend/
│  ├─ __init__.py
│  ├─ main.py
│  └─ requirements.txt
├─ frontend/
│  ├─ index.html
│  ├─ package.json
│  ├─ postcss.config.js
│  ├─ tailwind.config.js
│  ├─ tsconfig.json
│  ├─ tsconfig.app.json
│  ├─ tsconfig.node.json
│  ├─ vite.config.ts
│  └─ src/
│     ├─ api.ts
│     ├─ App.tsx
│     ├─ index.css
│     ├─ main.tsx
│     ├─ vite-env.d.ts
│     └─ components/
│        ├─ DataView.tsx
│        └─ VariableView.tsx
├─ .gitignore
├─ railway.json
└─ README.md
```

## Локальный запуск

### 1) Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend (в другом терминале)

```bash
cd frontend
npm install
npm run dev
```

Открыть: `http://localhost:5173`

## Production build (single service)

Frontend собирается в `backend/static`, и backend раздает SPA.

```bash
cd frontend
npm install
npm run build
cd ..
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Открыть: `http://localhost:8000`

## Railway деплой (пошагово)

1. Запушить проект в GitHub.
2. В Railway создать `New Project -> Deploy from GitHub repo`.
3. Railway подхватит `railway.json`.
4. В Variables добавить:
   - `PORT` (Railway обычно задает автоматически)
   - (опционально) `MAX_FILE_SIZE` (в байтах)
   - (опционально) `FILE_TTL` (в секундах)
5. Deploy.
6. После деплоя открыть выданный Railway URL.

## ENV переменные

- `PORT` (обязательно на Railway)
- `MAX_FILE_SIZE` (опционально, default `104857600`)
- `FILE_TTL` (опционально, default `3600`)

## API

- `POST /api/upload` — загрузка `.sav`
- `GET /api/dataset/{id}/summary` — файл/строки/переменные
- `GET /api/dataset/{id}/data?offset=0&limit=200&mode=values|labels`
- `GET /api/dataset/{id}/variables`
- `GET /api/health`

## Как протестировать загрузку `.sav`

1. Откройте приложение.
2. Нажмите `Upload .sav`.
3. Выберите тестовый `.sav`.
4. Проверьте:
   - в Data View видны строки/переменные, работает скролл
   - переключатель `Values/Labels` меняет отображение на основе metadata
   - Variable View показывает metadata из файла
5. Для полей без metadata убедитесь, что отображается пусто или `Unknown`.

## Запуск без команд (Windows)

- Двойной клик по `start_spss_viewer.bat`
- Остановить приложение: `stop_spss_viewer.bat`
