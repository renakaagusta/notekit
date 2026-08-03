'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/utils/cn'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

type MultiSelectContextType = {
  open: boolean
  setOpen: (open: boolean) => void
  selectedValues: Set<string>
  toggleValue: (value: string) => void
  items: Map<string, ReactNode>
  onItemAdded: (value: string, label: ReactNode) => void
  searchValue: string
  setSearchValue: (value: string) => void
  createdItems: string[]
  addCreatedItem: (value: string) => void
  allowCreate: boolean
  createLabel: string
  onCreateItem?: (value: string) => void
  minItems?: number
  maxItems?: number
}
const MultiSelectContext = createContext<MultiSelectContextType | null>(null)

export function MultiSelect({
  children,
  values,
  defaultValues,
  onValuesChange,
  allowCreate = false,
  onCreateItem,
  createLabel = 'Create "{value}"',
  minItems,
  maxItems,
}: {
  children: ReactNode
  values?: string[]
  defaultValues?: string[]
  onValuesChange?: (values: string[]) => void
  allowCreate?: boolean
  onCreateItem?: (value: string) => void
  createLabel?: string
  minItems?: number
  maxItems?: number
}) {
  const [open, setOpen] = useState(false)
  const [internalValues, setInternalValues] = useState(
    new Set<string>(values ?? defaultValues),
  )
  const selectedValues = useMemo(
    () => (values ? new Set(values) : internalValues),
    [values, internalValues],
  )
  const [items, setItems] = useState<Map<string, ReactNode>>(new Map())
  const [searchValue, setSearchValue] = useState('')
  const [createdItems, setCreatedItems] = useState<string[]>([])

  const addCreatedItem = useCallback((value: string) => {
    setCreatedItems((prev) => {
      if (prev.includes(value)) return prev
      return [...prev, value]
    })
  }, [])

  const toggleValue = useCallback(
    (value: string) => {
      setInternalValues((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(value)) {
          // Check minItems before removing
          if (minItems !== undefined && newSet.size <= minItems) {
            return prev
          }
          newSet.delete(value)
        } else {
          // Check maxItems before adding
          if (maxItems !== undefined && newSet.size >= maxItems) {
            return prev
          }
          newSet.add(value)
        }
        onValuesChange?.([...newSet])
        return newSet
      })
    },
    [onValuesChange, minItems, maxItems],
  )

  const onItemAdded = useCallback((value: string, label: ReactNode) => {
    setItems((prev) => {
      if (prev.get(value) === label) return prev
      return new Map(prev).set(value, label)
    })
  }, [])

  const contextValue = useMemo(
    () => ({
      open,
      setOpen,
      selectedValues,
      toggleValue,
      items,
      onItemAdded,
      searchValue,
      setSearchValue,
      createdItems,
      addCreatedItem,
      allowCreate,
      createLabel,
      onCreateItem,
      minItems,
      maxItems,
    }),
    [
      open,
      selectedValues,
      toggleValue,
      items,
      onItemAdded,
      searchValue,
      createdItems,
      addCreatedItem,
      allowCreate,
      createLabel,
      onCreateItem,
      minItems,
      maxItems,
    ],
  )

  return (
    <MultiSelectContext value={contextValue}>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        {children}
      </Popover>
    </MultiSelectContext>
  )
}

export function MultiSelectTrigger({
  className,
  children,
  ...props
}: {
  className?: string
  children?: ReactNode
} & ComponentPropsWithoutRef<typeof Button>) {
  const { open } = useMultiSelectContext()

  return (
    <PopoverTrigger asChild>
      <Button
        {...props}
        variant={props.variant ?? 'outline'}
        role={props.role ?? 'combobox'}
        aria-expanded={props['aria-expanded'] ?? open}
        className={cn(
          "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='text-'])]:text-muted-foreground flex h-auto min-h-9 w-fit items-center justify-between gap-2 overflow-hidden rounded-md border bg-transparent px-3 py-1.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          'aria-invalid:border-destructive dark:aria-invalid:border-destructive',
          'focus-visible:aria-invalid:ring-destructive/20 dark:focus-visible:aria-invalid:ring-destructive/40 focus-visible:aria-invalid:ring-[3px]',
          className,
        )}
      >
        {children}
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
  )
}

export function MultiSelectValue({
  placeholder,
  clickToRemove = true,
  className,
  overflowBehavior = 'wrap-when-open',
  ...props
}: {
  placeholder?: string
  clickToRemove?: boolean
  overflowBehavior?: 'wrap' | 'wrap-when-open' | 'cutoff'
} & Omit<ComponentPropsWithoutRef<'div'>, 'children'>) {
  const { selectedValues, toggleValue, items, open } = useMultiSelectContext()
  const [overflowAmount, setOverflowAmount] = useState(0)
  const valueRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDivElement>(null)

  const shouldWrap =
    overflowBehavior === 'wrap' ||
    (overflowBehavior === 'wrap-when-open' && open)

  const checkOverflow = useCallback(() => {
    if (valueRef.current == null) return

    const containerElement = valueRef.current
    const overflowElement = overflowRef.current
    const items = containerElement.querySelectorAll<HTMLElement>(
      '[data-selected-item]',
    )

    if (overflowElement != null) overflowElement.style.display = 'none'
    items.forEach((child) => child.style.removeProperty('display'))
    let amount = 0
    for (let i = items.length - 1; i >= 0; i--) {
      const child = items[i]!
      if (containerElement.scrollWidth <= containerElement.clientWidth) {
        break
      }
      amount = items.length - i
      child.style.display = 'none'
      overflowElement?.style.removeProperty('display')
    }
    setOverflowAmount(amount)
  }, [])

  const handleResize = useCallback(
    (node: HTMLDivElement) => {
      valueRef.current = node

      const mutationObserver = new MutationObserver(checkOverflow)
      const observer = new ResizeObserver(debounce(checkOverflow, 100))

      mutationObserver.observe(node, {
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      })
      observer.observe(node)

      return () => {
        observer.disconnect()
        mutationObserver.disconnect()
        valueRef.current = null
      }
    },
    [checkOverflow],
  )

  if (selectedValues.size === 0 && placeholder) {
    return (
      <span className="text-muted-foreground min-w-0 overflow-hidden font-normal">
        {placeholder}
      </span>
    )
  }

  return (
    <div
      {...props}
      ref={handleResize}
      className={cn(
        'flex w-full gap-1.5 overflow-hidden',
        shouldWrap && 'h-full flex-wrap',
        className,
      )}
    >
      {[...selectedValues]
        .filter((value) => items.has(value))
        .map((value) => (
          <Badge
            variant="outline"
            data-selected-item
            className="group flex items-center gap-1"
            key={value}
            onClick={
              clickToRemove
                ? (e) => {
                    e.stopPropagation()
                    toggleValue(value)
                  }
                : undefined
            }
          >
            {items.get(value)}
            {clickToRemove && (
              <XIcon className="text-muted-foreground group-hover:text-destructive size-2" />
            )}
          </Badge>
        ))}
      <Badge
        style={{
          display: overflowAmount > 0 && !shouldWrap ? 'block' : 'none',
        }}
        variant="outline"
        ref={overflowRef}
      >
        +{overflowAmount}
      </Badge>
    </div>
  )
}

export function MultiSelectContent({
  children,
  ...props
}: {
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<typeof Command>, 'children'>) {
  const { createdItems } = useMultiSelectContext()

  return (
    <>
      <div style={{ display: 'none' }}>
        <Command>
          <CommandList>
            {children}
            {createdItems.map((item) => (
              <MultiSelectItem key={item} value={item}>
                {item}
              </MultiSelectItem>
            ))}
          </CommandList>
        </Command>
      </div>
      <PopoverContent className="min-w-[var(--radix-popover-trigger-width)] p-0">
        <Command {...props}>{children}</Command>
      </PopoverContent>
    </>
  )
}

interface MultiSelectSearchProps {
  placeholder?: string
}

export function MultiSelectSearch({
  placeholder = 'Search',
}: MultiSelectSearchProps) {
  const { searchValue, setSearchValue } = useMultiSelectContext()
  return (
    <CommandInput
      placeholder={placeholder}
      value={searchValue}
      onValueChange={setSearchValue}
    />
  )
}

interface MultiSelectListProps {
  children: ReactNode
  className?: string
}

export function MultiSelectList({ children, className }: MultiSelectListProps) {
  const {
    searchValue,
    setSearchValue,
    toggleValue,
    onItemAdded,
    items,
    addCreatedItem,
    allowCreate,
    createLabel,
    onCreateItem,
  } = useMultiSelectContext()

  const handleCreate = () => {
    if (!searchValue.trim()) return
    const trimmedValue = searchValue.trim()
    onItemAdded(trimmedValue, trimmedValue)
    addCreatedItem(trimmedValue)
    toggleValue(trimmedValue)
    onCreateItem?.(trimmedValue)
    setSearchValue('')
  }

  const showCreateOption =
    allowCreate && searchValue.trim() !== '' && !items.has(searchValue.trim())

  return (
    <CommandList className={className}>
      {showCreateOption && (
        <CommandGroup>
          <CommandItem onSelect={handleCreate}>
            {createLabel.replace('{value}', searchValue.trim())}
          </CommandItem>
        </CommandGroup>
      )}
      {children}
    </CommandList>
  )
}

interface MultiSelectEmptyProps {
  children: ReactNode
}

export function MultiSelectEmpty({ children }: MultiSelectEmptyProps) {
  return <CommandEmpty>{children}</CommandEmpty>
}

export function MultiSelectItem({
  value,
  children,
  badgeLabel,
  onSelect,
  ...props
}: {
  badgeLabel?: ReactNode
  value: string
} & Omit<ComponentPropsWithoutRef<typeof CommandItem>, 'value'>) {
  const { toggleValue, selectedValues, onItemAdded } = useMultiSelectContext()
  const isSelected = selectedValues.has(value)

  useEffect(() => {
    onItemAdded(value, badgeLabel ?? children)
  }, [value, children, onItemAdded, badgeLabel])

  return (
    <CommandItem
      {...props}
      onSelect={() => {
        toggleValue(value)
        onSelect?.(value)
      }}
    >
      <CheckIcon
        className={cn('mr-2 size-4', isSelected ? 'opacity-100' : 'opacity-0')}
      />
      {children}
    </CommandItem>
  )
}

export function MultiSelectGroup(
  props: ComponentPropsWithoutRef<typeof CommandGroup>,
) {
  return <CommandGroup {...props} />
}

export function MultiSelectSeparator(
  props: ComponentPropsWithoutRef<typeof CommandSeparator>,
) {
  return <CommandSeparator {...props} />
}

export function MultiSelectCreatedGroup({
  heading,
}: {
  heading?: string
} = {}) {
  const { createdItems } = useMultiSelectContext()

  if (createdItems.length === 0) return null

  return (
    <>
      <MultiSelectSeparator />
      <MultiSelectGroup heading={heading}>
        {createdItems.map((item) => (
          <MultiSelectItem key={item} value={item}>
            {item}
          </MultiSelectItem>
        ))}
      </MultiSelectGroup>
    </>
  )
}

function useMultiSelectContext() {
  const context = useContext(MultiSelectContext)
  if (context == null) {
    throw new Error(
      'useMultiSelectContext must be used within a MultiSelectContext',
    )
  }
  return context
}

function debounce<T extends (...args: never[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return function (this: unknown, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(this, args), wait)
  }
}
