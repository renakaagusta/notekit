'use client'

import { XIcon } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useControlledState } from '@/hooks/use-controlled-state'
import { cn } from '@/utils/cn'
import { formatFileSize } from '@/utils/file'

export interface FileInputError {
  type: 'fileSizeExceeded'
  metadata: {
    maxSize: number
    maxSizeFormatted: string
    fileSize: number
    fileSizeFormatted: string
    fileName: string
  }
}

export interface FileInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange' | 'value' | 'defaultValue' | 'onError' | 'onBlur'
> {
  value?: File | null
  defaultValue?: File | null
  onChange?: (file: File | null) => void
  onBlur?: () => void
  onRemove?: () => void
  onError?: (error: FileInputError) => void
  maxSize?: number
  showPreview?: boolean
}

const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
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
      ...props
    },
    ref,
  ) => {
    const [file, setFile] = useControlledState(
      controlledValue,
      defaultValue,
      onChange,
    )
    const inputRef = React.useRef<HTMLInputElement>(null)

    const validateFile = (file: File): FileInputError | null => {
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
    }

    const handleRemoveFile = () => {
      setFile(null)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      onRemove?.()
    }

    React.useImperativeHandle(ref, () => inputRef.current!)

    if (!file || !showPreview) {
      return (
        <Input
          ref={inputRef}
          type="file"
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
          'bg-muted/50 animate-in fade-in rounded-md border p-3 duration-200',
          props['aria-invalid'] && 'border-destructive border',
          className,
        )}
      >
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
    )
  },
)

FileInput.displayName = 'FileInput'

export { FileInput }
