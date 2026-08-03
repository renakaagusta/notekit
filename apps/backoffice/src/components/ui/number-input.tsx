import { MinusIcon, PlusIcon } from 'lucide-react'

import {
  Button,
  Group,
  Input,
  NumberField,
  type NumberFieldProps,
} from 'react-aria-components'

import { cn } from '@/utils/cn'

export type NumberInputProps = Omit<
  NumberFieldProps,
  'isDisabled' | 'isRequired' | 'isInvalid' | 'isReadOnly'
> & {
  placeholder?: string
  disabled?: boolean
  required?: boolean
  readOnly?: boolean
  'aria-invalid'?: boolean
}

export function NumberInput({
  className,
  step,
  placeholder,
  disabled,
  required,
  readOnly,
  'aria-invalid': ariaInvalid,
  ...props
}: NumberInputProps) {
  return (
    <NumberField
      className={cn('w-full', className)}
      step={step}
      isDisabled={disabled}
      isRequired={required}
      isReadOnly={readOnly}
      isInvalid={ariaInvalid}
      {...props}
    >
      <Group
        className={cn(
          'dark:bg-input/30 border-input relative inline-flex h-9 w-full min-w-0 items-center overflow-hidden rounded-md border bg-transparent text-base whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 md:text-sm',
          'data-focus-within:border-ring data-focus-within:ring-ring/50 data-focus-within:ring-[3px]',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-focus-within:aria-invalid:ring-destructive/20 dark:data-focus-within:aria-invalid:ring-destructive/40 data-focus-within:aria-invalid:border-destructive',
        )}
      >
        <Input
          placeholder={placeholder}
          className={cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground w-full grow px-3 py-2 tabular-nums outline-none',
          )}
        />
        {step && (
          <Button
            slot="decrement"
            className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground mr-1.5 flex aspect-square h-5 items-center justify-center rounded-sm border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MinusIcon className="size-3" />
            <span className="sr-only">Decrement</span>
          </Button>
        )}
        {step && (
          <Button
            slot="increment"
            className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground mr-2 flex aspect-square h-5 items-center justify-center rounded-sm border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="size-3" />
            <span className="sr-only">Increment</span>
          </Button>
        )}
      </Group>
    </NumberField>
  )
}

export function InputGroupNumberInput({
  className,
  step,
  placeholder,
  disabled,
  required,
  readOnly,
  'aria-invalid': ariaInvalid,
  ...props
}: NumberInputProps) {
  return (
    <NumberField
      className={cn('flex-1', className)}
      step={step}
      isDisabled={disabled}
      isRequired={required}
      isReadOnly={readOnly}
      isInvalid={ariaInvalid}
      {...props}
    >
      <Group className="relative inline-flex h-full w-full min-w-0 items-center overflow-hidden rounded-none border-0 bg-transparent text-base whitespace-nowrap shadow-none outline-none md:text-sm">
        <Input
          data-slot="input-group-control"
          placeholder={placeholder}
          className={cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground w-full grow px-3 py-2 tabular-nums outline-none',
          )}
        />
        {step && (
          <Button
            slot="decrement"
            className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground mr-1.5 flex aspect-square h-5 items-center justify-center rounded-sm border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MinusIcon className="size-3" />
            <span className="sr-only">Decrement</span>
          </Button>
        )}
        {step && (
          <Button
            slot="increment"
            className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground mr-2 flex aspect-square h-5 items-center justify-center rounded-sm border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="size-3" />
            <span className="sr-only">Increment</span>
          </Button>
        )}
      </Group>
    </NumberField>
  )
}
