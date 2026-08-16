// Rule: no-reinvent-core
// Flags top-level function/arrow-const declarations whose names match known @notekit/core helpers,
// when the file is outside packages/core itself.

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    fixable: null,
    hasSuggestions: false,
    docs: {
      description: 'Disallow re-implementing helpers that already exist in @notekit/core',
      url: 'https://github.com/notekit/notekit/blob/main/CONVENTIONS.md#3--reuse-notekit-core-dont-re-invent-mirrors-paprika-goutils-reuse',
    },
    messages: {
      noReinventCore:
        '"{{name}}" already exists in @notekit/core. Import it instead of reimplementing it (CONVENTIONS #5).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          helpers: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] ?? {}
    const helpers = new Set(options.helpers ?? [])

    if (helpers.size === 0) return {}

    // Skip files inside packages/core
    const filename = context.filename ?? context.getFilename?.() ?? ''
    if (filename.includes('/packages/core/')) return {}

    function checkName(name, node) {
      if (helpers.has(name)) {
        context.report({
          node,
          messageId: 'noReinventCore',
          data: { name },
        })
      }
    }

    return {
      // Top-level function declarations, whether bare or exported:
      //   function slugify(...) {}      /      export function slugify(...) {}
      ':matches(Program, ExportNamedDeclaration, ExportDefaultDeclaration) > FunctionDeclaration'(node) {
        if (node.id) checkName(node.id.name, node.id)
      },

      // Top-level arrow/function const, whether bare or exported:
      //   const slugify = () => {}      /      export const slugify = () => {}
      ':matches(Program, ExportNamedDeclaration) > VariableDeclaration > VariableDeclarator'(node) {
        if (
          node.id.type === 'Identifier' &&
          node.init &&
          (node.init.type === 'ArrowFunctionExpression' ||
            node.init.type === 'FunctionExpression')
        ) {
          checkName(node.id.name, node.id)
        }
      },
    }
  },
}

export default rule
