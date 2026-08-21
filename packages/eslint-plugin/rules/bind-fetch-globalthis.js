// Rule: bind-fetch-globalthis
// Flags fetch.bind(this) — real transport bug that broke NoteKit under extension-wrapped fetch.
// Suggests replacing `this` with `globalThis`.

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    fixable: null,
    hasSuggestions: true,
    docs: {
      description: 'Bind fetch to globalThis, not this (prevents transport breakage under extension-wrapped fetch)',
      url: 'https://github.com/notekit/notekit/blob/main/CONVENTIONS.md#5--transport--crypto-invariants-encoded-from-real-bugs',
    },
    messages: {
      bindFetchGlobalThis:
        'fetch.bind(this) breaks under extension-wrapped fetch. Bind to globalThis instead (CONVENTIONS #5).',
      suggestGlobalThis: 'Replace this with globalThis',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        // Pattern: <expr>.bind(<ThisExpression>)
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.name !== 'bind'
        ) {
          return
        }

        // Argument must be `this`
        if (node.arguments.length !== 1 || node.arguments[0].type !== 'ThisExpression') {
          return
        }

        // Check callee object ends in a property named `fetch`
        const bindTarget = node.callee.object
        const isFetch =
          (bindTarget.type === 'Identifier' && bindTarget.name === 'fetch') ||
          (bindTarget.type === 'MemberExpression' &&
            bindTarget.property.type === 'Identifier' &&
            bindTarget.property.name === 'fetch')

        if (!isFetch) return

        const thisNode = node.arguments[0]

        context.report({
          node,
          messageId: 'bindFetchGlobalThis',
          suggest: [
            {
              messageId: 'suggestGlobalThis',
              fix(fixer) {
                return fixer.replaceText(thisNode, 'globalThis')
              },
            },
          ],
        })
      },
    }
  },
}

export default rule
