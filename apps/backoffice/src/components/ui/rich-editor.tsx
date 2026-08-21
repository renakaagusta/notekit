import { Image } from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  BoldIcon,
  ChevronDownIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  Redo2Icon,
  RemoveFormattingIcon,
  SeparatorHorizontalIcon,
  SquareCodeIcon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
  WrapTextIcon,
} from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldControl, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/utils/cn'

export type ToolbarItem =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'clearMarks'
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'codeBlock'
  | 'blockquote'
  | 'image'
  | 'horizontalRule'
  | 'hardBreak'
  | 'clearNodes'
  | 'undo'
  | 'redo'
  | 'separator'

const DEFAULT_TOOLBAR_ITEMS: ToolbarItem[] = [
  'bold',
  'italic',
  'underline',
  'separator',
  'link',
  'separator',
  'undo',
  'redo',
]

interface TiptapToolbarProps {
  editor: Editor | null
  items?: ToolbarItem[]
}

function TiptapToolbar({ editor, items }: TiptapToolbarProps) {
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const [linkUrl, setLinkUrl] = React.useState('')

  if (!editor) return null

  const toolbarItems = items && items.length > 0 ? items : DEFAULT_TOOLBAR_ITEMS
  const tooltipDelayDuration = 1000

  const handleSetLink = () => {
    if (linkUrl) {
      let normalizedUrl = linkUrl.trim()

      // Prepend https:// if no URI scheme or protocol-relative prefix is present
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`
      }

      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: normalizedUrl })
        .run()
    }
    setLinkUrl('')
    setLinkDialogOpen(false)
  }

  const renderToolbarItem = (item: ToolbarItem, index: number) => {
    switch (item) {
      case 'separator':
        return <div key={`sep-${index}`} className="bg-border mx-1 h-6 w-px" />

      case 'bold':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('bold')}
                onPressedChange={() =>
                  editor.chain().focus().toggleBold().run()
                }
                aria-label="Bold"
              >
                <BoldIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Bold</TooltipContent>
          </Tooltip>
        )

      case 'italic':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('italic')}
                onPressedChange={() =>
                  editor.chain().focus().toggleItalic().run()
                }
                aria-label="Italic"
              >
                <ItalicIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Italic</TooltipContent>
          </Tooltip>
        )

      case 'underline':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('underline')}
                onPressedChange={() =>
                  editor.chain().focus().toggleUnderline().run()
                }
                aria-label="Underline"
              >
                <UnderlineIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Underline</TooltipContent>
          </Tooltip>
        )

      case 'strikethrough':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('strike')}
                onPressedChange={() =>
                  editor.chain().focus().toggleStrike().run()
                }
                aria-label="Strikethrough"
              >
                <StrikethroughIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Strikethrough</TooltipContent>
          </Tooltip>
        )

      case 'code':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('code')}
                onPressedChange={() =>
                  editor.chain().focus().toggleCode().run()
                }
                aria-label="Code"
              >
                <CodeIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Inline code</TooltipContent>
          </Tooltip>
        )

      case 'link':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('link')}
                onPressedChange={() => {
                  if (editor.isActive('link')) {
                    editor.chain().focus().unsetLink().run()
                  } else {
                    setLinkDialogOpen(true)
                  }
                }}
                aria-label="Link"
              >
                <Link2Icon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              {editor.isActive('link') ? 'Remove link' : 'Add link'}
            </TooltipContent>
          </Tooltip>
        )

      case 'clearMarks':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={() =>
                  editor.chain().focus().unsetAllMarks().run()
                }
                aria-label="Clear marks"
              >
                <RemoveFormattingIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Clear formatting</TooltipContent>
          </Tooltip>
        )

      case 'paragraph':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('paragraph')}
                onPressedChange={() =>
                  editor.chain().focus().setParagraph().run()
                }
                aria-label="Paragraph"
              >
                <PilcrowIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Paragraph</TooltipContent>
          </Tooltip>
        )

      case 'heading':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Toggle
                      size="sm"
                      pressed={editor.isActive('heading')}
                      aria-label="Heading"
                      className="gap-1"
                    >
                      {editor.isActive('heading', { level: 1 }) && (
                        <Heading1Icon className="size-4" />
                      )}
                      {editor.isActive('heading', { level: 2 }) && (
                        <Heading2Icon className="size-4" />
                      )}
                      {editor.isActive('heading', { level: 3 }) && (
                        <Heading3Icon className="size-4" />
                      )}
                      {editor.isActive('heading', { level: 4 }) && (
                        <Heading4Icon className="size-4" />
                      )}
                      {editor.isActive('heading', { level: 5 }) && (
                        <Heading5Icon className="size-4" />
                      )}
                      {editor.isActive('heading', { level: 6 }) && (
                        <Heading6Icon className="size-4" />
                      )}
                      {!editor.isActive('heading') && (
                        <HeadingIcon className="size-4" />
                      )}
                      <ChevronDownIcon className="size-3" />
                    </Toggle>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      className={cn(
                        editor.isActive('heading', { level: 1 }) && 'bg-accent',
                      )}
                      onSelect={() =>
                        editor.chain().focus().setHeading({ level: 1 }).run()
                      }
                    >
                      <Heading1Icon className="size-4" />
                      Heading 1
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        editor.isActive('heading', { level: 2 }) && 'bg-accent',
                      )}
                      onSelect={() =>
                        editor.chain().focus().setHeading({ level: 2 }).run()
                      }
                    >
                      <Heading2Icon className="size-4" />
                      Heading 2
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        editor.isActive('heading', { level: 3 }) && 'bg-accent',
                      )}
                      onSelect={() =>
                        editor.chain().focus().setHeading({ level: 3 }).run()
                      }
                    >
                      <Heading3Icon className="size-4" />
                      Heading 3
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        editor.isActive('heading', { level: 4 }) && 'bg-accent',
                      )}
                      onSelect={() =>
                        editor.chain().focus().setHeading({ level: 4 }).run()
                      }
                    >
                      <Heading4Icon className="size-4" />
                      Heading 4
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        editor.isActive('heading', { level: 5 }) && 'bg-accent',
                      )}
                      onSelect={() =>
                        editor.chain().focus().setHeading({ level: 5 }).run()
                      }
                    >
                      <Heading5Icon className="size-4" />
                      Heading 5
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        editor.isActive('heading', { level: 6 }) && 'bg-accent',
                      )}
                      onSelect={() =>
                        editor.chain().focus().setHeading({ level: 6 }).run()
                      }
                    >
                      <Heading6Icon className="size-4" />
                      Heading 6
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TooltipTrigger>
            <TooltipContent>Heading</TooltipContent>
          </Tooltip>
        )

      case 'bulletList':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('bulletList')}
                onPressedChange={() =>
                  editor.chain().focus().toggleBulletList().run()
                }
                aria-label="Bullet List"
              >
                <ListIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Bullet list</TooltipContent>
          </Tooltip>
        )

      case 'orderedList':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('orderedList')}
                onPressedChange={() =>
                  editor.chain().focus().toggleOrderedList().run()
                }
                aria-label="Ordered List"
              >
                <ListOrderedIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Numbered list</TooltipContent>
          </Tooltip>
        )

      case 'codeBlock':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('codeBlock')}
                onPressedChange={() =>
                  editor.chain().focus().toggleCodeBlock().run()
                }
                aria-label="Code Block"
              >
                <SquareCodeIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Code block</TooltipContent>
          </Tooltip>
        )

      case 'blockquote':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={editor.isActive('blockquote')}
                onPressedChange={() =>
                  editor.chain().focus().toggleBlockquote().run()
                }
                aria-label="Blockquote"
              >
                <QuoteIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Blockquote</TooltipContent>
          </Tooltip>
        )

      case 'image':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = 'image/*'
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = (e) => {
                        const src = e.target?.result as string
                        if (src) {
                          editor.chain().focus().setImage({ src }).run()
                        }
                      }
                      reader.readAsDataURL(file)
                    }
                  }
                  input.click()
                }}
                aria-label="Insert image"
              >
                <ImageIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Insert image</TooltipContent>
          </Tooltip>
        )

      case 'horizontalRule':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={() =>
                  editor.chain().focus().setHorizontalRule().run()
                }
                aria-label="Horizontal rule"
              >
                <MinusIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Horizontal rule</TooltipContent>
          </Tooltip>
        )

      case 'hardBreak':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={() =>
                  editor.chain().focus().setHardBreak().run()
                }
                aria-label="Hard break"
              >
                <WrapTextIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Line break</TooltipContent>
          </Tooltip>
        )

      case 'clearNodes':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={() =>
                  editor.chain().focus().clearNodes().run()
                }
                aria-label="Clear nodes"
              >
                <SeparatorHorizontalIcon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Clear formatting</TooltipContent>
          </Tooltip>
        )

      case 'undo':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                aria-label="Undo"
              >
                <Undo2Icon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>
        )

      case 'redo':
        return (
          <Tooltip key={item} delayDuration={tooltipDelayDuration}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                aria-label="Redo"
              >
                <Redo2Icon className="size-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
        )

      default:
        return null
    }
  }

  return (
    <>
      <div className="bg-muted/50 flex flex-wrap items-center gap-0.5 border-b p-1">
        {toolbarItems.map((item, index) => renderToolbarItem(item, index))}
      </div>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Link</DialogTitle>
            <DialogDescription>
              Enter the URL you want to link to.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>URL</FieldLabel>
            <FieldControl>
              <Input
                type="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSetLink()
                  }
                }}
                autoFocus
              />
            </FieldControl>
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinkUrl('')
                setLinkDialogOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSetLink}>Add Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Shadcn-style prose styles compatible with Tailwind v4
const proseStyles = {
  base: cn(
    // Base text
    'prose prose-sm prose-neutral dark:prose-invert max-w-none',

    // Paragraphs
    'prose-p:leading-6 prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0',

    // Headings
    'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:scroll-mt-20',
    'prose-h1:text-4xl prose-h1:mt-6 prose-h1:mb-3',
    'prose-h2:text-3xl prose-h2:mt-6 prose-h2:mb-3',
    'prose-h3:text-2xl prose-h3:mt-4 prose-h3:mb-2',
    'prose-h4:text-xl prose-h4:mt-4 prose-h4:mb-2',
    'prose-h5:text-lg prose-h5:mt-3 prose-h5:mb-2',
    'prose-h6:text-base prose-h6:mt-3 prose-h6:mb-2',

    // Lists
    'prose-ul:my-2 prose-ul:list-disc prose-ul:pl-6',
    'prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-6',
    'prose-li:my-1',
    'prose-li:marker:text-muted-foreground',

    // Blockquotes
    'prose-blockquote:border-l-4 prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-3 prose-blockquote:text-muted-foreground',

    // Code
    "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-['']",
    'prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:p-4 prose-pre:my-3 prose-pre:overflow-x-auto',
    'prose-pre:code:bg-transparent prose-pre:code:p-0',

    // Links
    'prose-a:text-primary prose-a:underline prose-a:underline-offset-4 prose-a:decoration-primary/30 hover:prose-a:decoration-primary',

    // Strong & Em
    'prose-strong:font-semibold prose-strong:text-foreground',
    'prose-em:italic',

    // HR
    'prose-hr:border-border prose-hr:my-3',

    // Tables
    'prose-table:w-full prose-table:my-3 prose-table:border-collapse',
    'prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:font-semibold',
    'prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2',

    // Images
    'prose-img:rounded-lg prose-img:my-3',

    // Figure
    'prose-figcaption:text-sm prose-figcaption:text-muted-foreground prose-figcaption:text-center prose-figcaption:mt-2',
  ),
}

interface RichEditorProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  toolbarVisible?: boolean
  toolbarItems?: ToolbarItem[]
  className?: string
  editorClassName?: string
  contentType?: 'html' | 'markdown'
}

export function RichEditor({
  value = '',
  onChange,
  onBlur,
  placeholder,
  disabled = false,
  readOnly = false,
  toolbarVisible = true,
  toolbarItems,
  className,
  editorClassName,
  contentType = 'html',
}: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      TextStyleKit,
      StarterKit,
      Image,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-4',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      ...(contentType === 'markdown' ? [Markdown] : []),
    ],
    content: value,
    contentType: contentType === 'markdown' ? 'markdown' : undefined,
    editable: !disabled && !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const content =
        contentType === 'markdown' ? editor.getMarkdown() : editor.getHTML()
      onChange?.(content)
    },
    editorProps: {
      attributes: {
        class: cn(proseStyles.base, 'focus:outline-none min-h-[200px] p-3'),
      },
    },
    onBlur() {
      onBlur?.()
    },
  })

  React.useEffect(() => {
    if (editor) {
      const currentContent =
        contentType === 'markdown' ? editor.getMarkdown() : editor.getHTML()
      if (value !== currentContent) {
        editor.commands.setContent(value, {
          contentType: contentType === 'markdown' ? 'markdown' : undefined,
        })
      }
    }
  }, [value, editor, contentType])

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
      {toolbarVisible && <TiptapToolbar editor={editor} items={toolbarItems} />}
      <EditorContent
        editor={editor}
        className={cn('overflow-y-auto', editorClassName)}
      />
    </div>
  )
}

export { useEditor, type Editor }
