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
import { useControlledState } from '@/hooks/use-controlled-state'
import { cn } from '@/utils/cn'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

interface ComboboxContextValue {
  value: string
  setValue: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  selectedChildren?: React.ReactNode
  setSelectedChildren: (children: React.ReactNode) => void
}

// Context
const ComboboxContext = createContext<ComboboxContextValue | undefined>(
  undefined,
)

const useComboboxContext = () => {
  const context = useContext(ComboboxContext)
  if (!context) {
    throw new Error('Combobox components must be used within a Combobox')
  }
  return context
}

// Root Component
interface ComboboxProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
  name?: string
}

function isComboboxItem(
  element: React.ReactElement,
): element is React.ReactElement<ComboboxItemProps> {
  return element.type === ComboboxItem
}

function isReactElement(child: React.ReactNode): child is React.ReactElement {
  return React.isValidElement(child)
}

export function Combobox({
  name,
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  open: controlledOpen,
  onOpenChange,
  children,
}: ComboboxProps) {
  const [value, setValue] = useControlledState(
    controlledValue,
    defaultValue,
    onValueChange,
  )
  const [selectedChildren, setSelectedChildren] = useState<React.ReactNode>()
  const [open, setOpen] = useControlledState<boolean>(
    controlledOpen,
    false,
    onOpenChange,
  )

  const findSelectedChildren = useCallback(
    (children: React.ReactNode): React.ReactNode | undefined => {
      let result: React.ReactNode | undefined

      React.Children.forEach(children, (child) => {
        if (result) return // Stop if we already found the match

        if (isReactElement(child)) {
          if (isComboboxItem(child) && child.props.value === value) {
            result = child.props.children
          } else if ((child.props as React.PropsWithChildren).children) {
            // Recursively search through nested children
            const nestedResult = findSelectedChildren(
              (child.props as React.PropsWithChildren).children,
            )
            if (nestedResult) result = nestedResult
          }
        }
      })

      return result
    },
    [value],
  )

  useEffect(() => {
    if (value && !selectedChildren) {
      const matchingChildren = findSelectedChildren(children)
      if (matchingChildren) {
        setSelectedChildren(matchingChildren)
      }
    }
  }, [value, children, selectedChildren, findSelectedChildren])

  return (
    <ComboboxContext.Provider
      value={{
        value,
        setValue,
        open,
        setOpen,
        selectedChildren,
        setSelectedChildren,
      }}
    >
      <>
        <input type="hidden" name={name} value={value} />
        <Popover modal={true} open={open} onOpenChange={setOpen}>
          {children}
        </Popover>
      </>
    </ComboboxContext.Provider>
  )
}

interface ComboboxTriggerProps extends React.ComponentProps<'button'> {
  placeholder?: string
}

export function ComboboxTrigger({
  placeholder = 'Select option',
  className,
  ...props
}: ComboboxTriggerProps) {
  const { value, selectedChildren } = useComboboxContext()

  return (
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        role="combobox"
        value={value}
        className={cn(
          'hover:bg-background w-full justify-between overflow-hidden font-normal',
          "[&_svg:not([class*='text-'])]:text-muted-foreground",
          'aria-invalid:border-destructive dark:aria-invalid:border-destructive',
          'focus-visible:aria-invalid:ring-destructive/20 dark:focus-visible:aria-invalid:ring-destructive/40 focus-visible:aria-invalid:ring-[3px]',
          className,
        )}
        {...props}
      >
        {value && selectedChildren ? (
          <div className="min-w-0 truncate text-start">{selectedChildren}</div>
        ) : (
          <span
            className={cn(
              'min-w-0 truncate text-start',
              !value && 'text-muted-foreground',
            )}
          >
            {placeholder}
          </span>
        )}
        <ChevronDownIcon
          className="ml-auto shrink-0 opacity-50"
          aria-hidden="true"
        />
      </Button>
    </PopoverTrigger>
  )
}

// Content Component
interface ComboboxContentProps {
  children: React.ReactNode
}

export function ComboboxContent({ children }: ComboboxContentProps) {
  const { value, open } = useComboboxContext()
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && value) {
      const timeoutId = setTimeout(() => {
        const selectedElement = contentRef.current?.querySelector(
          `[data-item-value="${value}"]`,
        )
        if (selectedElement) {
          selectedElement.scrollIntoView({
            block: 'center',
            behavior: 'instant',
          })
        }
      }, 0)

      return () => clearTimeout(timeoutId)
    }
  }, [open, value])

  return (
    <PopoverContent
      className="w-full min-w-[var(--radix-popper-anchor-width)] p-0"
      align="start"
      ref={contentRef}
    >
      <Command>{children}</Command>
    </PopoverContent>
  )
}

interface ComboboxSearchProps {
  placeholder?: string
}

export function ComboboxSearch({
  placeholder = 'Search',
}: ComboboxSearchProps) {
  return <CommandInput placeholder={placeholder} className="h-9" />
}

// List Component
interface ComboboxListProps {
  children: React.ReactNode
  className?: string
}

export function ComboboxList({ children, className }: ComboboxListProps) {
  return <CommandList className={className}>{children}</CommandList>
}

interface ComboboxEmptyProps {
  children: React.ReactNode
}

export function ComboboxEmpty({ children }: ComboboxEmptyProps) {
  return <CommandEmpty>{children}</CommandEmpty>
}

// Group Component
interface ComboboxGroupProps {
  children: React.ReactNode
  heading?: string
}

export function ComboboxGroup({ children, heading }: ComboboxGroupProps) {
  return <CommandGroup heading={heading}>{children}</CommandGroup>
}

// Item Component
interface ComboboxItemProps {
  value: string
  keywords?: string[]
  className?: string
  children: React.ReactNode
}

export function ComboboxItem({
  value: itemValue,
  keywords,
  className,
  children,
}: ComboboxItemProps) {
  const { value, setValue, setOpen, setSelectedChildren } = useComboboxContext()

  return (
    <CommandItem
      className={cn('cursor-pointer', className)}
      value={itemValue}
      keywords={keywords}
      data-item-value={itemValue}
      onSelect={() => {
        setValue(itemValue)
        setSelectedChildren(children)
        setOpen(false)
      }}
    >
      {children}
      <CheckIcon
        className={cn(
          'ml-auto shrink-0',
          value === itemValue ? 'opacity-100' : 'opacity-0',
        )}
      />
    </CommandItem>
  )
}

export function ComboboxSeparator() {
  return <CommandSeparator />
}

// Button Component
interface ComboboxButtonProps {
  onClick?: () => void
  children?: React.ReactNode
  className?: string
}

export function ComboboxButton({
  onClick,
  children,
  className,
}: ComboboxButtonProps) {
  const { setOpen } = useComboboxContext()

  return (
    <div className="flex items-center border-t p-1">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'w-full justify-start rounded-md font-normal [&_svg]:-ms-2 [&_svg]:opacity-60',
          className,
        )}
        onClick={() => {
          setOpen(false)
          onClick?.()
        }}
      >
        {children}
      </Button>
    </div>
  )
}
