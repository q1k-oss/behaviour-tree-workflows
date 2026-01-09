/**
 * Scripting support for behavior trees
 * Executes JavaScript in isolated V8 sandbox for secure blackboard manipulation
 */

export type { ScriptConfiguration } from "./script-node.js";
export { Script, validateScriptSyntax } from "./script-node.js";
