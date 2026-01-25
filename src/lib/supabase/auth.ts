import {
  getMockUser,
  getMockOrganization,
  getMockUserId,
  getMockOrganizationId,
} from "./mock-user"

// Серверные функции для получения текущего пользователя
// TODO: Заменить на реальную проверку сессии Supabase

export async function getCurrentUser() {
  // В режиме разработки возвращаем mock
  return getMockUser()
}

export async function getCurrentOrganization() {
  // В режиме разработки возвращаем mock
  return getMockOrganization()
}

export async function getCurrentUserId(): Promise<string> {
  return getMockUserId()
}

export async function getCurrentOrganizationId(): Promise<string> {
  return getMockOrganizationId()
}

export async function requireAuth() {
  // TODO: Реализовать проверку авторизации и редирект на /login
  // Сейчас просто возвращаем mock данные
  const user = await getCurrentUser()
  const organization = await getCurrentOrganization()

  return { user, organization }
}
