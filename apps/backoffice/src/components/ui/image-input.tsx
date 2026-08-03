'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useControlledState } from '@/hooks/use-controlled-state'
import { cn } from '@/utils/cn'
import { formatFileSize } from '@/utils/file'
import { XIcon } from 'lucide-react'
import * as React from 'react'

export interface ImageInputError {
  type: 'fileSizeExceeded'
  metadata: {
    maxSize: number
    maxSizeFormatted: string
    fileSize: number
    fileSizeFormatted: string
    fileName: string
  }
}

export interface ImageInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange' | 'value' | 'defaultValue' | 'onError' | 'onBlur'
> {
  value?: File | null
  defaultValue?: File | null
  onChange?: (file: File | null) => void
  onBlur?: () => void
  onRemove?: () => void
  onError?: (error: ImageInputError) => void
  maxSize?: number
  showPreview?: boolean
  aspectRatio?: 'video' | 'square' | 'auto'
}

const ImageInput = React.forwardRef<HTMLInputElement, ImageInputProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue = null,
      onChange,
      onBlur,
      onRemove,
      onError,
      maxSize,
      showPreview = true,
      aspectRatio = 'video',
      accept = 'image/*',
      ...props
    },
    ref,
  ) => {
    const [file, setFile] = useControlledState(
      controlledValue,
      defaultValue,
      onChange,
    )
    const [previewUrl, setPreviewUrl] = React.useState('')
    const inputRef = React.useRef<HTMLInputElement>(null)

    const validateFile = (file: File): ImageInputError | null => {
      if (maxSize && file.size > maxSize) {
        return {
          type: 'fileSizeExceeded',
          metadata: {
            maxSize,
            maxSizeFormatted: formatFileSize(maxSize),
            fileSize: file.size,
            fileSizeFormatted: formatFileSize(file.size),
            fileName: file.name,
          },
        }
      }

      return null
    }

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0] || null

      if (selectedFile) {
        const validationError = validateFile(selectedFile)

        if (validationError) {
          onError?.(validationError)
          if (inputRef.current) {
            inputRef.current.value = ''
          }
          return
        }
      }

      setFile(selectedFile)

      if (selectedFile && selectedFile.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string)
        }
        reader.readAsDataURL(selectedFile)
      } else {
        setPreviewUrl('')
      }
    }

    const handleRemoveFile = () => {
      setFile(null)
      setPreviewUrl('')
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      onRemove?.()
    }

    React.useImperativeHandle(ref, () => inputRef.current!)

    const aspectRatioClass = {
      video: 'aspect-video',
      square: 'aspect-square',
      auto: 'aspect-auto',
    }[aspectRatio]

    if (!file || !showPreview) {
      return (
        <Input
          ref={inputRef}
          type="file"
          accept={accept}
          className={className}
          onChange={handleFileChange}
          onBlur={onBlur}
          {...props}
        />
      )
    }

    return (
      <div
        className={cn(
          'bg-muted/50 rounded-md border p-3',
          props['aria-invalid'] && 'border-destructive border',
          className,
        )}
      >
        <div className="flex flex-col gap-3">
          {previewUrl && (
            <div
              className={cn(
                'bg-muted animate-in fade-in zoom-in-95 relative w-full overflow-hidden rounded-md duration-200',
                aspectRatioClass,
              )}
            >
              <img
                src={previewUrl}
                alt="Preview"
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-muted-foreground text-xs">
                {formatFileSize(file.size)}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleRemoveFile}
            >
              <XIcon />
            </Button>
          </div>
        </div>
      </div>
    )
  },
)

ImageInput.displayName = 'ImageInput'

export { ImageInput }
