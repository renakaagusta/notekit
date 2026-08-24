'use client'

import { CloudUploadIcon, FileIcon, PlusIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { formatFileSize } from '../../../../domain/utils/file'
import { useControlledState } from '../../hooks/use-controlled-state'

import { cn } from '../../utils/cn'
import { Button } from './button'

export interface DropzoneError {
  type: 'fileTypeNotAccepted' | 'fileSizeExceeded' | 'maxFilesExceeded'
  metadata: {
    accept?: string
    maxSize?: number
    maxSizeFormatted?: string
    fileSize?: number
    fileSizeFormatted?: string
    fileName?: string
    maxFiles?: number
  }
}

export interface DropzoneProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue' | 'onError'
> {
  value?: File | File[] | null
  defaultValue?: File | File[] | null
  onChange?: (files: File | File[] | null) => void
  onRemove?: (index?: number) => void
  onError?: (error: DropzoneError) => void
  onBlur?: () => void
  accept?: string
  multiple?: boolean
  maxSize?: number
  maxFiles?: number
  disabled?: boolean
  showPreview?: boolean
  placeholder?: string
  dragActiveLabel?: string
  addMoreLabel?: string
}

const Dropzone = React.forwardRef<HTMLDivElement, DropzoneProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue = null,
      onChange,
      onRemove,
      onError,
      onBlur,
      accept,
      multiple = false,
      maxSize,
      maxFiles,
      disabled = false,
      showPreview = true,
      placeholder = 'Drag and drop files here, or click to select',
      dragActiveLabel,
      addMoreLabel,
      ...props
    },
    ref,
  ) => {
    const [files, setFiles] = useControlledState(
      controlledValue,
      defaultValue,
      onChange,
    )
    const [isDragging, setIsDragging] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)

    const validateFile = (file: File): DropzoneError | null => {
      if (accept) {
        const acceptedTypes = accept.split(',').map((type) => type.trim())
        const fileType = file.type
        const fileName = file.name
        const fileExtension = fileName.substring(fileName.lastIndexOf('.'))

        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith('.')) {
            return fileExtension === type
          }
          if (type.endsWith('/*')) {
            const baseType = type.split('/')[0]
            return fileType.startsWith(baseType + '/')
          }
          return fileType === type
        })

        if (!isAccepted) {
          return {
            type: 'fileTypeNotAccepted',
            metadata: { accept, fileName },
          }
        }
      }

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

    const handleFiles = (newFiles: FileList | null) => {
      if (!newFiles || newFiles.length === 0) return

      const fileArray = Array.from(newFiles)
      const validationError = fileArray
        .map(validateFile)
        .find((err) => err !== null)

      if (validationError) {
        onError?.(validationError)
        return
      }

      if (multiple) {
        const currentFiles = Array.isArray(files) ? files : files ? [files] : []
        const newTotalFiles = [...currentFiles, ...fileArray]

        if (maxFiles && newTotalFiles.length > maxFiles) {
          onError?.({
            type: 'maxFilesExceeded',
            metadata: {
              maxFiles,
            },
          })
          return
        }

        setFiles(newTotalFiles)
      } else {
        setFiles(fileArray[0] ?? null)
      }

      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) {
        setIsDragging(true)
      }
    }

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (disabled) return

      const droppedFiles = e.dataTransfer.files
      handleFiles(droppedFiles)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files)
    }

    const handleRemoveFile = (index?: number) => {
      if (multiple && Array.isArray(files) && typeof index === 'number') {
        const newFiles = files.filter((_, i) => i !== index)
        setFiles(newFiles.length > 0 ? newFiles : null)
      } else {
        setFiles(null)
      }
      onRemove?.(index)
    }

    const handleClick = () => {
      if (!disabled) {
        inputRef.current?.click()
      }
    }

    const fileList = files ? (Array.isArray(files) ? files : [files]) : []
    const hasFiles = fileList.length > 0

    return (
      <div ref={ref} className={cn('w-full', className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />

        {!hasFiles || !showPreview ? (
          <div
            {...props}
            role="button"
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onBlur={onBlur}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClick()
              }
            }}
            aria-disabled={disabled}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors',
              'aria-invalid:border-destructive',
              isDragging && 'border-primary bg-primary/5',
              !isDragging && 'border-input',
              !isDragging && !disabled && 'hover:bg-accent',
              disabled && 'cursor-not-allowed opacity-60',
              !disabled && 'cursor-pointer',
            )}
          >
            <CloudUploadIcon className="text-muted-foreground h-6 w-6" />
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                {isDragging ? (dragActiveLabel ?? placeholder) : placeholder}
              </p>
            </div>
          </div>
        ) : (
          <div {...props} className="space-y-2">
            {fileList.map((file, index) => (
              <FilePreview
                key={`${file.name}-${index}`}
                file={file}
                onRemove={() => handleRemoveFile(index)}
              />
            ))}
            {multiple && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClick}
                onBlur={onBlur}
                disabled={disabled}
                className="w-full"
                aria-invalid={Boolean(props['aria-invalid'])}
              >
                <PlusIcon className="size-4" /> {addMoreLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    )
  },
)

Dropzone.displayName = 'Dropzone'

interface FilePreviewProps {
  file: File
  onRemove: () => void
}

function FilePreview({ file, onRemove }: FilePreviewProps) {
  const [preview, setPreview] = React.useState<string | null>(null)
  const isImage = file.type.startsWith('image/')

  React.useEffect(() => {
    if (isImage) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setPreview(null)
    }
  }, [file, isImage])

  return (
    <div
      className={cn(
        'border-border bg-muted/50 flex items-center gap-3 rounded-md border p-3',
      )}
    >
      {isImage && preview ? (
        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded">
          <img
            src={preview}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="bg-muted flex h-12 w-12 flex-shrink-0 items-center justify-center rounded">
          <FileIcon className="text-muted-foreground h-6 w-6" />
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-muted-foreground text-xs">
          {formatFileSize(file.size)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        className="flex-shrink-0"
      >
        <XIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}

export { Dropzone }
