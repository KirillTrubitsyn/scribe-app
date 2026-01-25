import { MOCK_USER, MOCK_ORGANIZATION } from "@/lib/supabase/mock-user"

// TODO: Заменить на реальную аутентификацию
// import { createClient } from "@/lib/supabase/client"

interface UseUserReturn {
  user: typeof MOCK_USER | null
  organization: typeof MOCK_ORGANIZATION | null
  isLoading: boolean
}

export function useUser(): UseUserReturn {
  // В режиме разработки возвращаем mock данные
  // TODO: Реализовать реальную загрузку пользователя из Supabase Auth

  return {
    user: MOCK_USER,
    organization: MOCK_ORGANIZATION,
    isLoading: false,
  }
}

export function useUserId(): string {
  return MOCK_USER.id
}

export function useOrganizationId(): string {
  return MOCK_ORGANIZATION.id
}
