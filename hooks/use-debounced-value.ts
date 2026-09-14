import { useEffect, useState } from "react"

// Sem lib de debounce no projeto ainda — hook pequeno e reaproveitável,
// usado pelo PeoplePicker pra não bater no Microsoft Graph a cada tecla.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
