import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  Undo2Icon,
} from 'lucide-react'
import * as React from 'react'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/utils/cn'

interface TiptapToolbarProps {
  editor: Editor | null
}

function TiptapToolbar({ editor }: TiptapToolbarProps) {
  if (!editor) return null

  return (
    <div className="bg-muted/50 flex flex-wrap items-center gap-0.5 border-b p-1">
      <Toggle
        size="sm"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
      >
        <BoldIcon className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
      >
        <ItalicIcon className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('strike')}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Strikethrough"
      >
        <StrikethroughIcon className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('code')}
        onPressedChange={() => editor.chain().focus().toggleCode().run()}
        aria-label="Code"
      >
        <CodeIcon className="size-4" />
      </Toggle>

      <div className="bg-border mx-1 h-6 w-px" />

      <Toggle
        size="sm"
        pressed={editor.isActive('bulletList')}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet List"
      >
        <ListIcon className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('orderedList')}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Ordered List"
      >
        <ListOrderedIcon className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('blockquote')}
        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Blockquote"
      >
        <QuoteIcon className="size-4" />
      </Toggle>

      <div className="bg-border mx-1 h-6 w-px" />

      <Toggle
        size="sm"
        pressed={false}
        onPressedChange={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        aria-label="Undo"
      >
        <Undo2Icon className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={false}
        onPressedChange={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        aria-label="Redo"
      >
        <Redo2Icon className="size-4" />
      </Toggle>
    </div>
  )
}

interface MarkdownEditorProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  toolbarVisible?: boolean
  className?: string
  editorClassName?: string
}

export function MarkdownEditor({
  value = '',
  onChange,
  placeholder,
  disabled = false,
  readOnly = false,
  toolbarVisible = true,
  className,
  editorClassName,
}: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    contentType: 'markdown',
    editable: !disabled && !readOnly,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getMarkdown())
    },
    editorProps: {
      attributes: {
        class: 'tiptap min-h-[200px] p-3 focus:outline-none',
      },
    },
  })

  React.useEffect(() => {
    if (editor && value !== editor.getMarkdown()) {
      editor.commands.setContent(value, { contentType: 'markdown' })
    }
  }, [value, editor])

  React.useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled && !readOnly)
    }
  }, [disabled, readOnly, editor])

  return (
    <div
      className={cn(
        'border-input bg-background focus-within:ring-ring/50 rounded-md border text-sm focus-within:ring-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {toolbarVisible && <TiptapToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className={cn('overflow-y-auto', editorClassName)}
      />
    </div>
  )
}

export { useEditor, type Editor }
