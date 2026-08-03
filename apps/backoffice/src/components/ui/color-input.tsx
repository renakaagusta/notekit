'use client'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/utils/cn'
import { useState } from 'react'
import type { ColorSpace } from 'react-aria-components'
import * as Aria from 'react-aria-components'
import { Button } from './button'

function ColorPicker(props: Aria.ColorPickerProps) {
  return <Aria.ColorPicker {...props} />
}

function ColorSwatch(props: Aria.ColorSwatchProps) {
  return (
    <Aria.ColorSwatch
      className={cn('size-full rounded-sm')}
      style={({ color }) => ({
        background: `linear-gradient(${color}, ${color}),
          repeating-conic-gradient(#CCC 0% 25%, white 0% 50%) 50% / 16px 16px`,
      })}
      {...props}
    />
  )
}

function ColorArea({
  className = '',
  ...props
}: { className?: string } & Aria.ColorAreaProps) {
  return (
    <Aria.ColorArea
      colorSpace="hsb"
      xChannel="saturation"
      yChannel="brightness"
      className={cn(
        'aspect-square max-w-full cursor-crosshair rounded-lg active:cursor-grabbing',
        className,
      )}
      {...props}
    >
      <ColorThumb />
    </Aria.ColorArea>
  )
}

function ColorThumb({
  className,
  slider,
  ...props
}: { className?: string; slider?: boolean } & Aria.ColorThumbProps) {
  return (
    <Aria.ColorThumb
      className={cn(
        'size-6 cursor-grab rounded-full border-5 border-white outline-1 -outline-offset-5 active:cursor-grabbing',
        slider && 'translate-y-1/2',
        className,
      )}
      {...props}
    />
  )
}

function ColorField({
  className,
  title,
  ...props
}: { className?: string; title?: string } & Aria.ColorFieldProps) {
  return (
    <Aria.ColorField {...props} aria-label="Color value">
      <Aria.Input
        className={cn(
          'placeholder:text-muted-foreground dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full min-w-0 rounded-md border bg-transparent px-2.5 py-1 text-xs shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]',
          className,
        )}
        title={title}
      />
    </Aria.ColorField>
  )
}

type ColorFormatString = 'hex' | 'rgb' | 'hsl' | 'hsb'

function ColorFieldWithFormats({
  className,
  opacity,
}: {
  className?: string
  opacity?: boolean
}) {
  const formats: ColorFormatString[] = ['hex', 'rgb', 'hsl', 'hsb']
  const [format, setFormat] = useState<ColorFormatString>('hex')
  return !opacity ? (
    <div className="flex items-center gap-2">
      <Select
        value={format}
        onValueChange={(value) => setFormat(value as ColorFormatString)}
      >
        <SelectTrigger
          size="sm"
          className={cn('w-fit px-2.5 text-xs uppercase', className)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {formats.map((fmt) => (
            <SelectItem key={fmt} value={fmt} className="text-xs uppercase">
              {fmt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {format !== 'hex' ? (
        Aria.getColorChannels(format as ColorSpace).map((channel) => (
          <ColorField
            key={channel}
            colorSpace={format as ColorSpace}
            channel={channel}
            className="flex"
          />
        ))
      ) : (
        <ColorField />
      )}
    </div>
  ) : (
    <ColorField />
  )
}

function ColorHueSlider({
  className,
  ...props
}: { className?: string } & Omit<
  Aria.ColorSliderProps,
  'colorSpace' | 'channel'
>) {
  return (
    <Aria.ColorSlider colorSpace="hsb" channel="hue" {...props}>
      <Aria.SliderTrack className={cn('h-6 w-full rounded-full', className)}>
        <ColorThumb slider />
      </Aria.SliderTrack>
    </Aria.ColorSlider>
  )
}

function ColorOpacitySlider({
  className,
  ...props
}: { className?: string } & Omit<Aria.ColorSliderProps, 'channel'>) {
  return (
    <Aria.ColorSlider channel="alpha" {...props}>
      <Aria.SliderTrack
        className={cn('h-6 w-full rounded-full', className)}
        style={({ defaultStyle }) => ({
          background: `${defaultStyle.background},
            repeating-conic-gradient(#CDCDCD 0% 25%, white 0% 50%) 50% / 14px 14px`,
        })}
      >
        <ColorThumb slider />
      </Aria.SliderTrack>
    </Aria.ColorSlider>
  )
}

function ColorSwatchPicker({
  className,
  ...props
}: { className?: string } & Aria.ColorSwatchPickerProps) {
  return (
    <Aria.ColorSwatchPicker
      className={cn('grid grid-cols-8 gap-2', className)}
      {...props}
    />
  )
}

function ColorSwatchPickerItem({
  className,
  ...props
}: { className?: string } & Aria.ColorSwatchPickerItemProps) {
  return (
    <Aria.ColorSwatchPickerItem {...props}>
      <ColorSwatch
        className={cn('aspect-square size-full rounded-md', className)}
      />
    </Aria.ColorSwatchPickerItem>
  )
}

function ColorInput({
  name,
  className,
  opacity = false,
  swatchColors = [],
  disabled,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  onChange,
  onBlur,
  ...props
}: {
  name?: string
  className?: string
  opacity?: boolean
  swatchColors?: string[]
  disabled?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
  'aria-invalid'?: boolean
  onChange?: (value: string) => void
  onBlur?: () => void
} & Omit<Aria.ColorPickerProps, 'children' | 'onChange'>) {
  const [internalValue, setInternalValue] = useState('')

  const handleChange = (color: Aria.Color) => {
    const colorString = color.toString(opacity ? 'hexa' : 'hex')
    setInternalValue(colorString)
    onChange?.(colorString)
  }

  return (
    <ColorPicker onChange={handleChange} {...props}>
      {name && <input type="hidden" name={name} value={internalValue} />}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn('p-1', className)}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-required={ariaRequired}
            aria-invalid={ariaInvalid}
            onBlur={onBlur}
          >
            <ColorSwatch {...props} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="flex w-64 flex-col gap-3 p-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <ColorArea />
          <div className="flex w-full flex-col gap-2">
            <ColorHueSlider />
            {opacity && <ColorOpacitySlider />}
          </div>
          <div className="flex items-center gap-2">
            <ColorFieldWithFormats opacity={opacity} />
            {opacity && (
              <ColorField
                channel="alpha"
                className="w-13 text-end"
                title="Alpha"
              />
            )}
          </div>
          {swatchColors.length > 0 && (
            <ColorSwatchPicker>
              {swatchColors.map((color) => (
                <ColorSwatchPickerItem key={color} color={color} />
              ))}
            </ColorSwatchPicker>
          )}
        </PopoverContent>
      </Popover>
    </ColorPicker>
  )
}

export { ColorInput }
