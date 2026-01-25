// Mock данные для разработки без аутентификации
// TODO: Заменить на реальную аутентификацию Supabase Auth

export const MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "dev@sgc-scribe.local",
  created_at: new Date().toISOString(),
}

export const MOCK_ORGANIZATION = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Сибирская Генерирующая Компания",
  slug: "sgc",
  created_at: new Date().toISOString(),
}

export function getMockUser() {
  return MOCK_USER
}

export function getMockOrganization() {
  return MOCK_ORGANIZATION
}

export function getMockUserId(): string {
  return MOCK_USER.id
}

export function getMockOrganizationId(): string {
  return MOCK_ORGANIZATION.id
}
