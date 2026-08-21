import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from './no-emoji-as-icon.js'

const tester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: { jsx: true },
      ecmaVersion: 2022,
    },
  },
})

describe('no-emoji-as-icon', () => {
  it('passes valid cases and catches invalid cases', () => {
    tester.run('no-emoji-as-icon', rule, {
      valid: [
        // Plain text, not JSX
        { code: `const x = "hello world"` },
        // lucide icon usage — fine
        { code: `const el = <ChevronRight size={16} />` },
        // JSX with no emoji
        { code: `const el = <div>hello world</div>` },
        // Emoji in non-JSX string
        { code: `const label = "emoji: ✨"` },
      ],
      invalid: [
        // Emoji in JSX text
        {
          code: `const el = <div>✨</div>`,
          errors: [{ messageId: 'noEmojiAsIcon' }],
        },
        // Emoji in JSX string literal attribute value
        {
          code: `const el = <div label={"\u{1F4DD}"}></div>`,
          errors: [{ messageId: 'noEmojiAsIcon' }],
        },
        // Emoji in JSX expression container string
        {
          code: `const el = <span>{"\u{1F680}"}</span>`,
          errors: [{ messageId: 'noEmojiAsIcon' }],
        },
      ],
    })
  })
})
