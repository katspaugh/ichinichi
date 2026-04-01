/**
 * ESLint rule: limits useEffect calls per function scope.
 *
 * Encourages phase-gated reducers over useEffect chains.
 * Options: [severity, { warn: 4, error: 6 }]
 */

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Limit the number of useEffect calls per component/hook",
    },
    schema: [
      {
        type: "object",
        properties: {
          warn: { type: "number" },
          error: { type: "number" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyEffects:
        "{{count}} useEffect calls in {{name}} (threshold: {{threshold}}). Consider a phase-gated reducer pattern instead.",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const warnThreshold = options.warn ?? 4;
    const errorThreshold = options.error ?? 6;

    // Stack of { name, count } for nested function scopes
    const scopeStack = [];

    function isReactFunctionScope(node) {
      const name = getFunctionName(node);
      if (!name) return false;
      // React components (PascalCase) or hooks (use*)
      return /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
    }

    function getFunctionName(node) {
      if (node.id?.name) return node.id.name;
      if (
        node.parent?.type === "VariableDeclarator" &&
        node.parent.id?.type === "Identifier"
      ) {
        return node.parent.id.name;
      }
      return null;
    }

    function enterFunction(node) {
      if (isReactFunctionScope(node)) {
        scopeStack.push({ name: getFunctionName(node), count: 0, node });
      }
    }

    function exitFunction(node) {
      if (
        scopeStack.length > 0 &&
        scopeStack[scopeStack.length - 1].node === node
      ) {
        const scope = scopeStack.pop();
        if (scope.count >= errorThreshold) {
          context.report({
            node,
            messageId: "tooManyEffects",
            data: {
              count: String(scope.count),
              name: scope.name,
              threshold: String(errorThreshold),
            },
          });
        } else if (scope.count >= warnThreshold) {
          context.report({
            node,
            messageId: "tooManyEffects",
            data: {
              count: String(scope.count),
              name: scope.name,
              threshold: String(warnThreshold),
            },
          });
        }
      }
    }

    return {
      FunctionDeclaration: enterFunction,
      FunctionExpression: enterFunction,
      ArrowFunctionExpression: enterFunction,
      "FunctionDeclaration:exit": exitFunction,
      "FunctionExpression:exit": exitFunction,
      "ArrowFunctionExpression:exit": exitFunction,

      CallExpression(node) {
        if (scopeStack.length === 0) return;
        const callee = node.callee;
        if (callee.type === "Identifier" && callee.name === "useEffect") {
          scopeStack[scopeStack.length - 1].count++;
        }
        if (callee.type === "Identifier" && callee.name === "useLayoutEffect") {
          scopeStack[scopeStack.length - 1].count++;
        }
      },
    };
  },
};
