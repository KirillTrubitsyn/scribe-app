-- ============================================
-- SGC Scribe Seed Data (Development)
-- ============================================

-- Тестовая организация
INSERT INTO organizations (id, name, slug, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Сибирская Генерирующая Компания',
  'sgc',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Тестовый пользователь в auth.users
-- ВАЖНО: Этот INSERT нужно выполнить через Supabase Dashboard
-- или использовать service role key, так как auth.users защищена
--
-- Для локальной разработки можно создать пользователя через:
-- 1. Supabase Dashboard -> Authentication -> Users -> Add user
-- 2. Или через supabase CLI: supabase auth admin create-user
--
-- INSERT INTO auth.users (id, email, created_at, updated_at)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'dev@sgc-scribe.local',
--   NOW(),
--   NOW()
-- );

-- Связь пользователя с организацией (owner)
-- Раскомментировать после создания пользователя в auth.users
--
-- INSERT INTO organization_members (organization_id, user_id, role, created_at)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   '00000000-0000-0000-0000-000000000001',
--   'owner',
--   NOW()
-- ) ON CONFLICT DO NOTHING;
