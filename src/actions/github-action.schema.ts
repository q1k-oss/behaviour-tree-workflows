/**
 * Zod schema for GitHubAction node configuration
 * Validates YAML/JSON configuration for GitHub operations
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

/**
 * GitHubAction node configuration schema
 *
 * @example YAML - Create PR
 * ```yaml
 * type: GitHubAction
 * id: create-pr
 * props:
 *   operation: createPullRequest
 *   repo: "${input.repo}"
 *   params:
 *     title: "feat: new feature"
 *     head: "feat/branch"
 *     base: "main"
 *   outputKey: prResult
 * ```
 *
 * @example YAML - Merge PR
 * ```yaml
 * type: GitHubAction
 * id: merge-pr
 * props:
 *   operation: mergePullRequest
 *   repo: "${input.repo}"
 *   params:
 *     pullNumber: "${bb.prResult.number}"
 *     mergeMethod: "squash"
 *   outputKey: mergeResult
 * ```
 */
export const githubActionSchema = createNodeSchema("GitHubAction", {
  operation: z.enum([
    "createBranch",
    "createPullRequest",
    "getPullRequest",
    "mergePullRequest",
    "closePullRequest",
    "createReview",
    "listIssues",
    "addLabels",
    "createComment",
    "createRelease",
  ]),
  repo: z.string().min(1, "repo is required (owner/repo format)"),
  params: z.record(z.string(), z.unknown()).default({}),
  outputKey: z.string().min(1, "outputKey is required"),
});

export type GitHubActionSchemaType = z.infer<typeof githubActionSchema>;
