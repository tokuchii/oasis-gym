export function useApi() {
  return $fetch.create({ credentials: 'include' })
}
