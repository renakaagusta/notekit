import * as React from 'react'

export interface UseOptimisticValueReturn<T> {
  /** Get the effective value (optimistic if pending, otherwise actual) */
  value: T
  /** Set an optimistic value */
  setValue: (optimisticValue: T) => void
  /** Revert to the original actual value */
  revertValue: () => void
}

export interface UseOptimisticValueMapReturn<K, T> {
  /** Get the effective value for a key */
  getValue: (key: K, actualValue: T) => T
  /** Set an optimistic value for a key */
  setValue: (key: K, optimisticValue: T) => void
  /** Revert to the original actual value for a key */
  revertValue: (key: K) => void
}

/**
 * A hook for managing a single optimistic value update.
 *
 * @example
 * ```tsx
 * const optimistic = useOptimisticValue<boolean>(agent.settings?.googleSearchEnabled ?? false)
 *
 * const handleToggle = (enabled: boolean) => {
 *   optimistic.setValue(enabled)
 *
 *   updateEnabledFn({ enabled })
 *     .then(() => {
 *       router.invalidate() // Actual value updates, no need to revert
 *     })
 *     .catch(() => {
 *       optimistic.revertValue() // Clear optimistic value to fall back to actual value
 *       toast.error('Failed')
 *     })
 * }
 *
 * // In render:
 * <Switch checked={optimistic.value} />
 * ```
 */
export function useOptimisticValue<T>(
  actualValue: T,
): UseOptimisticValueReturn<T> {
  const [optimisticValue, setOptimisticValue] = React.useState<T | undefined>(
    undefined,
  )

  const value = optimisticValue !== undefined ? optimisticValue : actualValue

  const setValue = React.useCallback((newValue: T) => {
    setOptimisticValue(newValue)
  }, [])

  const revertValue = React.useCallback(() => {
    setOptimisticValue(undefined)
  }, [])

  return {
    value,
    setValue,
    revertValue,
  }
}

/**
 * A hook for managing optimistic value updates for multiple items.
 *
 * @example
 * ```tsx
 * const optimistic = useOptimisticValueMap<number, boolean>()
 *
 * const handleToggle = (id: number, enabled: boolean) => {
 *   optimistic.setValue(id, enabled)
 *
 *   updateEnabledFn({ id, enabled })
 *     .then(() => {
 *       router.invalidate() // Actual value updates, no need to revert
 *     })
 *     .catch(() => {
 *       optimistic.revertValue(id) // Revert to original value on error
 *       toast.error('Failed')
 *     })
 * }
 *
 * // In render:
 * <Switch checked={optimistic.getValue(item.id, item.enabled)} />
 * ```
 */
export function useOptimisticValueMap<
  K extends string | number,
  T,
>(): UseOptimisticValueMapReturn<K, T> {
  const [map, setMap] = React.useState<Map<K, T>>(new Map())

  const getValue = (key: K, actualValue: T): T => {
    const optimistic = map.get(key)
    return map.has(key) && optimistic !== undefined ? optimistic : actualValue
  }

  const setValue = React.useCallback((key: K, value: T) => {
    setMap((prev) => new Map(prev).set(key, value))
  }, [])

  const revertValue = React.useCallback((key: K) => {
    setMap((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  return {
    getValue,
    setValue,
    revertValue,
  }
}

export interface OptimisticItem<T> {
  optimisticId: string
  data: T
}

export interface UseOptimisticListReturn<T> {
  /** Combined list with optimistic items at the top */
  allItems: (T & { isOptimistic?: boolean; optimisticId?: string })[]
  /** Add an optimistic item, returns the optimistic ID */
  addOptimistic: (data: T) => string
  /** Remove an optimistic item by its ID */
  removeOptimistic: (optimisticId: string) => void
  /** Clear all optimistic items */
  clearOptimistic: () => void
}

/**
 * A hook for managing optimistic updates in lists.
 *
 * @example
 * ```tsx
 * const { allItems, addOptimistic, removeOptimistic } = useOptimisticList(qas)
 *
 * const handleCreate = () => {
 *   const optimisticId = addOptimistic({
 *     id: -1,
 *     title,
 *     question,
 *     answer,
 *     status: 'pending',
 *     createdAt: new Date(),
 *   })
 *
 *   createItemFn({ data: { title, question, answer } })
 *     .then(() => {
 *       removeOptimistic(optimisticId)
 *       toast.success('Created!')
 *       router.invalidate()
 *     })
 *     .catch(() => {
 *       removeOptimistic(optimisticId)
 *       toast.error('Failed')
 *     })
 * }
 * ```
 */
export function useOptimisticList<T>(items: T[]): UseOptimisticListReturn<T> {
  const [optimisticItems, setOptimisticItems] = React.useState<
    OptimisticItem<T>[]
  >([])

  const addOptimistic = React.useCallback((data: T): string => {
    const optimisticId = crypto.randomUUID()
    setOptimisticItems((prev) => [{ optimisticId, data }, ...prev])
    return optimisticId
  }, [])

  const removeOptimistic = React.useCallback((optimisticId: string) => {
    setOptimisticItems((prev) =>
      prev.filter((item) => item.optimisticId !== optimisticId),
    )
  }, [])

  const clearOptimistic = React.useCallback(() => {
    setOptimisticItems([])
  }, [])

  const allItems = React.useMemo((): (T & {
    isOptimistic?: boolean
    optimisticId?: string
  })[] => {
    return [
      ...optimisticItems.map((item) => ({
        ...item.data,
        optimisticId: item.optimisticId,
        isOptimistic: true as const,
      })),
      ...items.map((item) => ({ ...item, isOptimistic: false as const })),
    ]
  }, [items, optimisticItems])

  return {
    allItems,
    addOptimistic,
    removeOptimistic,
    clearOptimistic,
  }
}
