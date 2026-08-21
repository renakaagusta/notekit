// Rule: no-emoji-as-icon
// Flags emoji used in JSX where a lucide-react icon should be used instead.

const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    fixable: null,
    hasSuggestions: false,
    docs: {
      description: 'Disallow emoji used as icons in JSX — use lucide-react instead',
      url: 'https://github.com/notekit/notekit/blob/main/CONVENTIONS.md#2--icons-are-lucide-react-never-emoji',
    },
    messages: {
      noEmojiAsIcon:
        'Emoji "{{emoji}}" used in JSX. Use a lucide-react icon component instead (CONVENTIONS #2).',
    },
    schema: [],
  },

  create(context) {
    function checkText(value, reportNode) {
      const match = value.match(EXTENDED_PICTOGRAPHIC)
      if (match) {
        context.report({
          node: reportNode,
          messageId: 'noEmojiAsIcon',
          data: { emoji: match[0] },
        })
      }
    }

    function isInsideJSX(node) {
      let current = node.parent
      while (current) {
        if (
          current.type === 'JSXElement' ||
          current.type === 'JSXFragment' ||
          current.type === 'JSXAttribute' ||
          current.type === 'JSXExpressionContainer'
        ) {
          return true
        }
        current = current.parent
      }
      return false
    }

    return {
      JSXText(node) {
        checkText(node.value, node)
      },

      Literal(node) {
        if (typeof node.value === 'string' && isInsideJSX(node)) {
          checkText(node.value, node)
        }
      },

      TemplateLiteral(node) {
        if (!isInsideJSX(node)) return
        for (const quasi of node.quasis) {
          checkText(quasi.value.raw, quasi)
        }
      },
    }
  },
}

export default rule
