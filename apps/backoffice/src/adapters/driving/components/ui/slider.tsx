'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'
import * as React from 'react'

import { cn } from '../../utils/cn'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './tooltip'

interface SliderProps extends React.ComponentProps<
  typeof SliderPrimitive.Root
> {
  showTooltip?: boolean
  formatTooltip?: (value: number) => string
  /**
   * Labels for each thumb. For single thumb, pass a string.
   * For multiple thumbs, pass an array of strings.
   * Falls back to aria-label prop for single thumb.
   */
  thumbAriaLabels?: string | string[]
  /**
   * IDs for aria-labelledby for each thumb. For single thumb, pass a string.
   * For multiple thumbs, pass an array of strings.
   * Falls back to aria-labelledby prop for single thumb.
   */
  thumbAriaLabelledBy?: string | string[]
  /**
   * IDs for aria-describedby for each thumb. For single thumb, pass a string.
   * For multiple thumbs, pass an array of strings.
   * Falls back to aria-describedby prop for single thumb.
   */
  thumbAriaDescribedBy?: string | string[]
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  showTooltip = false,
  formatTooltip = (value) => String(value),
  thumbAriaLabels,
  thumbAriaLabelledBy,
  thumbAriaDescribedBy,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ...props
}: SliderProps) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  )

  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null)

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          'bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            'bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => {
        const thumbAriaLabel = Array.isArray(thumbAriaLabels)
          ? thumbAriaLabels[index]
          : index === 0
            ? (thumbAriaLabels ?? ariaLabel)
            : undefined

        const thumbAriaLabelledByValue = thumbAriaLabel
          ? undefined
          : Array.isArray(thumbAriaLabelledBy)
            ? thumbAriaLabelledBy[index]
            : index === 0
              ? (thumbAriaLabelledBy ?? ariaLabelledBy)
              : undefined

        const thumbAriaDescribedByValue = Array.isArray(thumbAriaDescribedBy)
          ? thumbAriaDescribedBy[index]
          : index === 0
            ? (thumbAriaDescribedBy ?? ariaDescribedBy)
            : undefined

        return (
          <SliderThumb
            key={index}
            index={index}
            value={_values[index] ?? min}
            showTooltip={showTooltip}
            formatTooltip={formatTooltip}
            isDragging={draggingIndex === index}
            onDragStart={() => setDraggingIndex(index)}
            onDragEnd={() => setDraggingIndex(null)}
            aria-label={thumbAriaLabel}
            aria-labelledby={thumbAriaLabelledByValue}
            aria-describedby={thumbAriaDescribedByValue}
          />
        )
      })}
    </SliderPrimitive.Root>
  )
}

interface SliderThumbProps {
  index: number
  value: number
  showTooltip: boolean
  formatTooltip: (value: number) => string
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

function SliderThumb({
  value,
  showTooltip,
  formatTooltip,
  isDragging,
  onDragStart,
  onDragEnd,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: SliderThumbProps) {
  const thumb = (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className="border-primary ring-ring/50 block size-4 shrink-0 rounded-full border bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
      onPointerDown={onDragStart}
      onPointerUp={onDragEnd}
      onPointerLeave={onDragEnd}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    />
  )

  if (!showTooltip) {
    return thumb
  }

  return (
    <Tooltip open={isDragging}>
      <TooltipTrigger asChild>{thumb}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {formatTooltip(value)}
      </TooltipContent>
    </Tooltip>
  )
}

export { Slider }
