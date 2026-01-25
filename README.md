# SGC Scribe

Система транскрибации и анализа аудио/видео записей для Сибирской Генерирующей Компании.

## Технологии

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **AI/ML**: Google Cloud Speech-to-Text, Vertex AI
- **Storage**: Google Cloud Storage

## Начало работы

### Требования

- Node.js 18+
- npm или yarn
- Аккаунт Supabase
- Аккаунт Google Cloud (для Speech-to-Text)

### Установка

```bash
# Установка зависимостей
npm install

# Копирование переменных окружения
cp .env.local.example .env.local

# Запуск в режиме разработки
npm run dev
```

### Переменные окружения

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
```

## Режим разработки

Приложение работает без аутентификации. Используется тестовый пользователь и организация.

**Тестовые данные:**
- User ID: `00000000-0000-0000-0000-000000000001`
- Organization: "Сибирская Генерирующая Компания" (slug: `sgc`)

### TODO перед продакшеном

1. Реализовать страницы `/login` и `/register`
2. Настроить Supabase Auth
3. Обновить middleware для проверки сессии
4. Заменить mock-функции на реальные
5. Обновить RLS политики для проверки `auth.uid()`

**Файлы для обновления:**
- `src/lib/supabase/auth.ts`
- `src/hooks/use-user.ts`
- `src/middleware.ts`
- `supabase/migrations/xxx_production_rls.sql`

## Структура проекта

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── recordings/        # Страницы записей
│   └── page.tsx           # Главная страница
├── components/            # React компоненты
├── hooks/                 # React хуки
├── lib/                   # Утилиты и клиенты
│   ├── supabase/         # Supabase клиенты
│   └── google/           # Google Cloud клиенты
└── types/                 # TypeScript типы

supabase/
├── migrations/            # SQL миграции
└── seed.sql              # Тестовые данные
```

## База данных

Схема базы данных включает:

- `organizations` — Организации (мультитенантность)
- `organization_members` — Участники организаций
- `recordings` — Загруженные записи
- `transcripts` — Результаты транскрибации
- `artifacts` — Сгенерированные артефакты (саммари, протоколы)
- `speakers` — Идентификация спикеров
- `processing_jobs` — Отслеживание фоновых задач

## Лицензия

Proprietary. All rights reserved.
