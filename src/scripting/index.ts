/**
 * Scripting module (deprecated)
 *
 * The Script node has been replaced by CodeExecution which uses
 * Microsandbox for secure, isolated code execution.
 *
 * Use CodeExecution instead:
 * @example
 * ```yaml
 * type: CodeExecution
 * id: transform-data
 * props:
 *   language: javascript  # or 'python'
 *   code: |
 *     const users = getBB('users');
 *     setBB('count', users.length);
 * ```
 *
 * @see CodeExecution in src/actions/code-execution.ts
 */

// No exports - use CodeExecution instead
