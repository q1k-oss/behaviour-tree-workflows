/**
 * MathOp Node
 *
 * Safe arithmetic expression evaluation with blackboard variable resolution.
 * Uses a recursive descent parser — NO eval().
 *
 * Supports: +, -, *, /, %, (), unary minus, numeric literals, ${bb.x} references.
 *
 * @example YAML
 * ```yaml
 * type: MathOp
 * id: compute-rate
 * props:
 *   expression: "${bb.orderCount} / (${bb.lookbackMinutes} / 60)"
 *   outputKey: hourlyRate
 *   round: round
 *   precision: 1
 * ```
 */

import { ActionNode } from "../base-node.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";
import {
  resolveString,
  type VariableContext,
} from "./variable-resolver.js";

export interface MathOpConfig extends NodeConfiguration {
  /** Arithmetic expression with ${bb.x} references */
  expression: string;
  /** Blackboard key to store result */
  outputKey: string;
  /** Rounding mode: "none" (default) | "round" | "floor" | "ceil" */
  round?: "none" | "round" | "floor" | "ceil";
  /** Decimal precision for rounding (e.g., 1 = one decimal place) */
  precision?: number;
}

// --- Safe Expression Parser (Recursive Descent) ---

interface Token {
  type: "number" | "op" | "lparen" | "rparen";
  value: string | number;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: ch === "(" ? "lparen" : "rparen", value: ch });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%") {
      // Distinguish unary minus from subtraction
      const prev = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
      const isUnary =
        ch === "-" &&
        (tokens.length === 0 ||
          prev?.type === "op" ||
          prev?.type === "lparen");
      if (isUnary) {
        // Read the number after unary minus
        let numStr = "-";
        i++;
        while (i < expr.length && isDigitOrDot(expr[i]!)) {
          numStr += expr[i]!;
          i++;
        }
        if (numStr === "-") {
          // Unary minus before parenthesis: treat as -1 *
          tokens.push({ type: "number", value: -1 });
          tokens.push({ type: "op", value: "*" });
        } else {
          const num = parseFloat(numStr);
          if (isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
          tokens.push({ type: "number", value: num });
        }
        continue;
      }
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (isDigitOrDot(ch)) {
      let numStr = "";
      while (i < expr.length && isDigitOrDot(expr[i]!)) {
        numStr += expr[i]!;
        i++;
      }
      const num = parseFloat(numStr);
      if (isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
      tokens.push({ type: "number", value: num });
      continue;
    }
    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }
  return tokens;
}

function isDigitOrDot(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || ch === ".";
}

/**
 * Recursive descent parser for arithmetic expressions.
 * Grammar:
 *   expr     → term (('+' | '-') term)*
 *   term     → factor (('*' | '/' | '%') factor)*
 *   factor   → NUMBER | '(' expr ')'
 */
function evaluate(tokens: Token[]): number {
  let pos = 0;

  function current(): Token | undefined {
    return tokens[pos];
  }

  function parseExpr(): number {
    let left = parseTerm();
    let tok = current();
    while (tok && tok.type === "op" && (tok.value === "+" || tok.value === "-")) {
      const op = tok.value as string;
      pos++;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
      tok = current();
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    let tok = current();
    while (tok && tok.type === "op" && (tok.value === "*" || tok.value === "/" || tok.value === "%")) {
      const op = tok.value as string;
      pos++;
      const right = parseFactor();
      if ((op === "/" || op === "%") && right === 0) {
        throw new Error("Division by zero");
      }
      if (op === "*") left = left * right;
      else if (op === "/") left = left / right;
      else left = left % right;
      tok = current();
    }
    return left;
  }

  function parseFactor(): number {
    const tok = current();
    if (!tok) {
      throw new Error("Unexpected end of expression");
    }
    if (tok.type === "number") {
      pos++;
      return tok.value as number;
    }
    if (tok.type === "lparen") {
      pos++; // consume '('
      const val = parseExpr();
      const closing = current();
      if (!closing || closing.type !== "rparen") {
        throw new Error("Missing closing parenthesis");
      }
      pos++; // consume ')'
      return val;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(tok)}`);
  }

  const result = parseExpr();
  const remaining = current();
  if (remaining) {
    throw new Error(`Unexpected token after expression: ${JSON.stringify(remaining)}`);
  }
  return result;
}

/** Exported for testing */
export function safeEvaluate(expression: string): number {
  const tokens = tokenize(expression);
  if (tokens.length === 0) {
    throw new Error("Empty expression");
  }
  return evaluate(tokens);
}

function applyRounding(value: number, round: string, precision: number): number {
  if (round === "none") return value;
  const factor = Math.pow(10, precision);
  const scaled = value * factor;
  switch (round) {
    case "round":
      return Math.round(scaled) / factor;
    case "floor":
      return Math.floor(scaled) / factor;
    case "ceil":
      return Math.ceil(scaled) / factor;
    default:
      return value;
  }
}

export class MathOp extends ActionNode {
  private expression: string;
  private outputKey: string;
  private round: string;
  private precision: number;

  constructor(config: MathOpConfig) {
    super(config);
    this.expression = config.expression;
    this.outputKey = config.outputKey;
    this.round = config.round ?? "none";
    this.precision = config.precision ?? 0;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // Resolve ${bb.x} references to their values
      const resolved = resolveString(this.expression, varCtx);

      // The resolved value might already be a number (single variable reference)
      let result: number;
      if (typeof resolved === "number") {
        result = resolved;
      } else if (typeof resolved === "string") {
        result = safeEvaluate(resolved);
      } else {
        throw new Error(`Expression resolved to non-numeric type: ${typeof resolved}`);
      }

      if (!isFinite(result)) {
        throw new Error(`Expression result is not finite: ${result}`);
      }

      result = applyRounding(result, this.round, this.precision);

      context.blackboard.set(this.outputKey, result);
      this.log(`${this.expression} = ${result}`);
      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`MathOp failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
