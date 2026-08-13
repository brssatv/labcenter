(function initFormulaEngine(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterFormulaEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  const operatorPairs = new Set(["<=", ">=", "<>", "!=", "==", "&&", "||"]);

  function normalizeReferenceKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function createFormulaError(message, position = null) {
    return new Error(
      position === null || position === undefined
        ? String(message || "Invalid formula expression.")
        : `${String(message || "Invalid formula expression.")} at character ${Number(position) + 1}.`
    );
  }

  function tokenizeFormulaExpression(source) {
    const text = String(source || "");
    const tokens = [];
    let index = 0;

    while (index < text.length) {
      const char = text[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      const pair = text.slice(index, index + 2);
      if (operatorPairs.has(pair)) {
        tokens.push({ type: "operator", value: pair, position: index });
        index += 2;
        continue;
      }

      if (/[(),.]/.test(char)) {
        tokens.push({ type: "punctuation", value: char, position: index });
        index += 1;
        continue;
      }

      if (/[+\-*/%<>=!]/.test(char)) {
        tokens.push({ type: "operator", value: char, position: index });
        index += 1;
        continue;
      }

      if (char === '"' || char === "'") {
        const quote = char;
        const start = index;
        let value = "";
        index += 1;

        while (index < text.length) {
          const current = text[index];
          if (current === "\\") {
            const escaped = text[index + 1];
            if (escaped === undefined) {
              throw createFormulaError("Unterminated string literal", start);
            }
            if (escaped === "n") value += "\n";
            else if (escaped === "r") value += "\r";
            else if (escaped === "t") value += "\t";
            else value += escaped;
            index += 2;
            continue;
          }
          if (current === quote) {
            index += 1;
            tokens.push({ type: "string", value, position: start });
            value = null;
            break;
          }
          value += current;
          index += 1;
        }

        if (value !== null) {
          throw createFormulaError("Unterminated string literal", start);
        }
        continue;
      }

      if (/[0-9]/.test(char)) {
        const start = index;
        let value = char;
        index += 1;

        while (index < text.length && /[0-9.]/.test(text[index])) {
          value += text[index];
          index += 1;
        }

        if (!/^\d+(\.\d+)?$/.test(value)) {
          throw createFormulaError(`Invalid number "${value}"`, start);
        }

        tokens.push({ type: "number", value: Number(value), position: start });
        continue;
      }

      if (char === "@" || /[A-Za-z_]/.test(char)) {
        const start = index;
        let value = char;
        index += 1;

        while (index < text.length && /[A-Za-z0-9_]/.test(text[index])) {
          value += text[index];
          index += 1;
        }

        tokens.push({
          type: char === "@" ? "macro" : "identifier",
          value,
          position: start,
        });
        continue;
      }

      throw createFormulaError(`Unexpected token "${char}"`, index);
    }

    tokens.push({ type: "eof", value: "", position: text.length });
    return tokens;
  }

  class FormulaParser {
    constructor(tokens) {
      this.tokens = Array.isArray(tokens) ? tokens : [];
      this.index = 0;
    }

    current() {
      return this.tokens[this.index] || this.tokens[this.tokens.length - 1];
    }

    advance() {
      const token = this.current();
      this.index += 1;
      return token;
    }

    matchOperator(...values) {
      const token = this.current();
      if (token?.type === "operator" && values.includes(token.value)) {
        this.index += 1;
        return token;
      }
      return null;
    }

    matchPunctuation(...values) {
      const token = this.current();
      if (token?.type === "punctuation" && values.includes(token.value)) {
        this.index += 1;
        return token;
      }
      return null;
    }

    matchKeyword(...values) {
      const token = this.current();
      if (
        token?.type === "identifier"
        && values.map((item) => normalizeReferenceKey(item)).includes(normalizeReferenceKey(token.value))
      ) {
        this.index += 1;
        return token;
      }
      return null;
    }

    expectPunctuation(value) {
      const token = this.matchPunctuation(value);
      if (!token) {
        throw createFormulaError(`Expected "${value}"`, this.current()?.position);
      }
      return token;
    }

    expectPropertyIdentifier() {
      const token = this.current();
      if (token?.type === "identifier" || token?.type === "macro") {
        this.index += 1;
        return token;
      }
      throw createFormulaError("Expected a property name", token?.position);
    }

    parse() {
      const expression = this.parseOrExpression();
      const token = this.current();
      if (token?.type !== "eof") {
        throw createFormulaError(`Unexpected token "${token.value}"`, token?.position);
      }
      return expression;
    }

    parseOrExpression() {
      let node = this.parseAndExpression();
      while (this.matchKeyword("OR") || this.matchOperator("||")) {
        const operator = this.tokens[this.index - 1];
        node = {
          type: "binary",
          operator: operator.value,
          left: node,
          right: this.parseAndExpression(),
        };
      }
      return node;
    }

    parseAndExpression() {
      let node = this.parseEqualityExpression();
      while (this.matchKeyword("AND") || this.matchOperator("&&")) {
        const operator = this.tokens[this.index - 1];
        node = {
          type: "binary",
          operator: operator.value,
          left: node,
          right: this.parseEqualityExpression(),
        };
      }
      return node;
    }

    parseEqualityExpression() {
      let node = this.parseComparisonExpression();
      while (this.matchOperator("=", "==", "!=", "<>")) {
        const operator = this.tokens[this.index - 1];
        node = {
          type: "binary",
          operator: operator.value,
          left: node,
          right: this.parseComparisonExpression(),
        };
      }
      return node;
    }

    parseComparisonExpression() {
      let node = this.parseAdditiveExpression();
      while (this.matchOperator("<", "<=", ">", ">=")) {
        const operator = this.tokens[this.index - 1];
        node = {
          type: "binary",
          operator: operator.value,
          left: node,
          right: this.parseAdditiveExpression(),
        };
      }
      return node;
    }

    parseAdditiveExpression() {
      let node = this.parseMultiplicativeExpression();
      while (this.matchOperator("+", "-")) {
        const operator = this.tokens[this.index - 1];
        node = {
          type: "binary",
          operator: operator.value,
          left: node,
          right: this.parseMultiplicativeExpression(),
        };
      }
      return node;
    }

    parseMultiplicativeExpression() {
      let node = this.parseUnaryExpression();
      while (this.matchOperator("*", "/", "%")) {
        const operator = this.tokens[this.index - 1];
        node = {
          type: "binary",
          operator: operator.value,
          left: node,
          right: this.parseUnaryExpression(),
        };
      }
      return node;
    }

    parseUnaryExpression() {
      if (this.matchKeyword("NOT") || this.matchOperator("!", "-")) {
        const operator = this.tokens[this.index - 1];
        return {
          type: "unary",
          operator: operator.value,
          argument: this.parseUnaryExpression(),
        };
      }
      return this.parsePostfixExpression(this.parsePrimaryExpression());
    }

    parsePrimaryExpression() {
      const token = this.current();

      if (token?.type === "number") {
        this.advance();
        return { type: "literal", value: token.value };
      }

      if (token?.type === "string") {
        this.advance();
        return { type: "literal", value: token.value };
      }

      if (token?.type === "identifier") {
        this.advance();
        const keyword = normalizeReferenceKey(token.value);
        if (keyword === "true") return { type: "literal", value: true };
        if (keyword === "false") return { type: "literal", value: false };
        if (keyword === "null") return { type: "literal", value: null };
        return { type: "identifier", name: token.value };
      }

      if (token?.type === "macro") {
        this.advance();
        return { type: "identifier", name: token.value };
      }

      if (this.matchPunctuation("(")) {
        const expression = this.parseOrExpression();
        this.expectPunctuation(")");
        return expression;
      }

      throw createFormulaError(`Unexpected token "${token?.value || ""}"`, token?.position);
    }

    parsePostfixExpression(node) {
      let expression = node;

      while (true) {
        if (this.matchPunctuation("(")) {
          const args = [];
          if (!this.matchPunctuation(")")) {
            do {
              args.push(this.parseOrExpression());
            } while (this.matchPunctuation(","));
            this.expectPunctuation(")");
          }
          expression = {
            type: "call",
            callee: expression,
            args,
          };
          continue;
        }

        if (this.matchPunctuation(".")) {
          const property = this.expectPropertyIdentifier();
          expression = {
            type: "member",
            object: expression,
            property: property.value,
          };
          continue;
        }

        break;
      }

      return expression;
    }
  }

  function parseFormulaExpression(source) {
    return new FormulaParser(tokenizeFormulaExpression(source)).parse();
  }

  function flattenValues(items) {
    return items.reduce((all, item) => {
      if (Array.isArray(item)) {
        all.push(...flattenValues(item));
      } else {
        all.push(item);
      }
      return all;
    }, []);
  }

  function createDefaultFunctions() {
    return {
      IF(condition, truthyValue, falsyValue) {
        return condition ? truthyValue : falsyValue;
      },
      COUNT(...items) {
        return flattenValues(items).filter(Boolean).length;
      },
      AVG(...items) {
        const values = flattenValues(items)
          .filter((item) => item !== null && item !== undefined && item !== "")
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item));
        if (!values.length) return null;
        return values.reduce((total, item) => total + item, 0) / values.length;
      },
      ANY(...items) {
        return flattenValues(items).some(Boolean);
      },
      ALL(...items) {
        return flattenValues(items).every(Boolean);
      },
      ISNULL(value) {
        return value === null || value === undefined || value === "";
      },
      COALESCE(...items) {
        return flattenValues(items).find((item) => item !== null && item !== undefined && item !== "");
      },
      ROUND(value, decimals = 0) {
        const amount = Number(value);
        const precision = Number.isInteger(Number(decimals)) ? Number(decimals) : 0;
        if (!Number.isFinite(amount)) return null;
        return Number(amount.toFixed(Math.max(0, precision)));
      },
      LOWER(value) {
        return String(value === null || value === undefined ? "" : value).toLowerCase();
      },
      UPPER(value) {
        return String(value === null || value === undefined ? "" : value).toUpperCase();
      },
    };
  }

  function createLookupMap(values) {
    const lookup = new Map();

    if (values instanceof Map) {
      values.forEach((value, key) => {
        lookup.set(normalizeReferenceKey(key), value);
      });
      return lookup;
    }

    if (values && typeof values === "object") {
      Object.entries(values).forEach(([key, value]) => {
        lookup.set(normalizeReferenceKey(key), value);
      });
    }

    return lookup;
  }

  function resolveContextValue(name, runtime) {
    const normalized = normalizeReferenceKey(name);
    if (runtime.variables.has(normalized)) {
      return runtime.variables.get(normalized);
    }
    if (runtime.functions.has(normalized)) {
      return runtime.functions.get(normalized);
    }
    throw createFormulaError(`Unknown identifier "${name}"`);
  }

  function resolveObjectProperty(target, propertyName) {
    if (target === null || target === undefined) return null;
    if (typeof target !== "object") {
      throw createFormulaError(`Cannot read property "${propertyName}" from a non-object value`);
    }
    if (Object.prototype.hasOwnProperty.call(target, propertyName)) {
      return target[propertyName];
    }
    const normalized = normalizeReferenceKey(propertyName);
    const matchedKey = Object.keys(target).find((key) => normalizeReferenceKey(key) === normalized);
    return matchedKey ? target[matchedKey] : null;
  }

  function evaluateBinaryOperator(operator, leftValue, rightValue) {
    switch (operator) {
      case "OR":
      case "||":
        return Boolean(leftValue) || Boolean(rightValue);
      case "AND":
      case "&&":
        return Boolean(leftValue) && Boolean(rightValue);
      case "=":
      case "==":
        return leftValue == rightValue; // eslint-disable-line eqeqeq
      case "!=":
      case "<>":
        return leftValue != rightValue; // eslint-disable-line eqeqeq
      case "<":
        return leftValue < rightValue;
      case "<=":
        return leftValue <= rightValue;
      case ">":
        return leftValue > rightValue;
      case ">=":
        return leftValue >= rightValue;
      case "+":
        return leftValue + rightValue;
      case "-":
        return Number(leftValue) - Number(rightValue);
      case "*":
        return Number(leftValue) * Number(rightValue);
      case "/":
        return Number(leftValue) / Number(rightValue);
      case "%":
        return Number(leftValue) % Number(rightValue);
      default:
        throw createFormulaError(`Unsupported operator "${operator}"`);
    }
  }

  function evaluateUnaryOperator(operator, value) {
    switch (normalizeReferenceKey(operator)) {
      case "not":
      case "!":
        return !value;
      case "-":
        return -Number(value);
      default:
        throw createFormulaError(`Unsupported unary operator "${operator}"`);
    }
  }

  function evaluateFormulaAst(node, runtime) {
    if (!node || typeof node !== "object") {
      return null;
    }

    switch (node.type) {
      case "literal":
        return node.value;

      case "identifier":
        return resolveContextValue(node.name, runtime);

      case "member":
        return resolveObjectProperty(evaluateFormulaAst(node.object, runtime), node.property);

      case "call": {
        const callee = evaluateFormulaAst(node.callee, runtime);
        if (typeof callee !== "function") {
          throw createFormulaError("Only functions can be called in formula expressions");
        }
        const args = node.args.map((argument) => evaluateFormulaAst(argument, runtime));
        return callee(...args);
      }

      case "unary":
        return evaluateUnaryOperator(node.operator, evaluateFormulaAst(node.argument, runtime));

      case "binary": {
        if (node.operator === "OR" || node.operator === "||") {
          const leftValue = evaluateFormulaAst(node.left, runtime);
          if (leftValue) return true;
          return Boolean(evaluateFormulaAst(node.right, runtime));
        }

        if (node.operator === "AND" || node.operator === "&&") {
          const leftValue = evaluateFormulaAst(node.left, runtime);
          if (!leftValue) return false;
          return Boolean(evaluateFormulaAst(node.right, runtime));
        }

        return evaluateBinaryOperator(
          node.operator,
          evaluateFormulaAst(node.left, runtime),
          evaluateFormulaAst(node.right, runtime)
        );
      }

      default:
        throw createFormulaError(`Unsupported formula node "${node.type}"`);
    }
  }

  function evaluateFormulaExpression(source, context = {}) {
    const runtime = {
      variables: createLookupMap(context.variables),
      functions: createLookupMap({
        ...createDefaultFunctions(),
        ...(context.functions || {}),
      }),
    };

    return evaluateFormulaAst(parseFormulaExpression(source), runtime);
  }

  return {
    tokenizeFormulaExpression,
    parseFormulaExpression,
    evaluateFormulaExpression,
  };
});
