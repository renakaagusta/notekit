import * as React from 'react'

import { cn } from '../../utils/cn'
import { Input } from './input'

export interface TimeInputProps extends Omit<
  React.ComponentProps<'input'>,
  'type'
> {
  /* For time inputs, the value of step is given in seconds. The default value is 60, indicating 1 minute. */
  step?: number
  /* A string specifying the earliest time to accept. */
  min?: string
  /* A string specifying the latest time to accept. */
  max?: string
}

function TimeInput({ className, step, min, max, ...props }: TimeInputProps) {
  return (
    <Input
      type="time"
      step={step}
      min={min}
      max={max}
      className={cn(
        'bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupTimeInput({
  className,
  step,
  min,
  max,
  ...props
}: TimeInputProps) {
  return (
    <Input
      type="time"
      data-slot="input-group-control"
      step={step}
      min={min}
      max={max}
      className={cn(
        'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
        'appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none',
        className,
      )}
      {...props}
    />
  )
}

export { InputGroupTimeInput, TimeInput }
