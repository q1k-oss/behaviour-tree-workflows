# AI-Native Nodes Implementation Plan

This document outlines the implementation plan for adding AI-native nodes to @wayfarer-ai/btree-workflows.

## Overview

AI-native nodes extend the behavior tree library with intelligent agents, LLM integrations, and modern AI capabilities. These nodes follow the same patterns as existing nodes (activity-based execution, blackboard integration, YAML support) while adding AI-specific features.

### Implementation Progress

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| Phase 1: MVP | 7 | 3 | 4 |
| Phase 2: RAG Enhancement | 2 | 0 | 2 |
| Phase 3: Media | 4 | 0 | 4 |
| Phase 4: Utilities | 3 | 0 | 3 |
| Phase 5: Orchestration | 4 | 0 | 4 |

---

## MVP Nodes (Phase 1)

### 1. ClaudeAgent

> **Status**: DONE — `src/actions/claude-agent.ts` (27 tests)
>
> Autonomous coding agent powered by Claude Agent SDK. Supports configurable tools,
> permissions (default/acceptEdits/bypassPermissions), MCP servers, subagents,
> cost limits (maxBudgetUsd), variable resolution in prompt/systemPrompt/model/cwd.
> Activity-based: `claudeAgent?: (request) => Promise<ClaudeAgentResult>`.

**Purpose**: Goal-driven autonomous agent that can use tools, reason about tasks, and enable self-evolving workflows.

**Why MVP**: Most strategic node - enables dynamic node creation, self-improvement, and orchestration of other AI nodes.

**Props**:
```yaml
type: ClaudeAgent
props:
  prompt: "Implement the Summarizer node following existing patterns"
  model: "claude-sonnet-4-5-20250929"        # optional, variable-resolvable
  systemPrompt: "You are a senior dev..."     # optional, variable-resolvable
  allowedTools:                               # optional
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
  permissionMode: "acceptEdits"               # default | acceptEdits | bypassPermissions
  maxTurns: 50                                # default: 50
  maxBudgetUsd: 5.0                           # optional cost cap
  cwd: "${bb.workingDirectory}"               # optional, variable-resolvable
  mcpServers:                                 # optional MCP server configs
    playwright:
      command: "npx"
      args: ["@playwright/mcp@latest"]
  agents:                                     # optional subagent definitions
    code-reviewer:
      description: "Expert code reviewer"
      prompt: "Review code quality..."
      tools: ["Read", "Glob", "Grep"]
  outputKey: "agentResult"                    # required
```

**Implementation Notes**:
- Uses Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) via activity
- Support MCP tools (including Terminator for computer use)
- Subagent support for delegating specialized tasks
- Session ID returned for resuming agent conversations
- Cost tracking via totalCostUsd in result

**Activity Interface**:
```typescript
claudeAgent?: (request: ClaudeAgentRequest) => Promise<ClaudeAgentResult>;

// ClaudeAgentRequest: prompt, model?, systemPrompt?, allowedTools?, permissionMode?,
//   maxTurns?, maxBudgetUsd?, cwd?, mcpServers?, agents?, context?
// ClaudeAgentResult: result, sessionId, success, numTurns, totalCostUsd, usage, durationMs, errors?
```

---

### 2. BrowserAgent

> **Status**: DONE — `src/actions/browser-agent.ts` (739-line test suite)
>
> Implemented as goal-driven agent via Browserbase + Stagehand. Supports context persistence,
> session recording with debug URLs, configurable LLM provider/model, variable resolution.
> Activity-based: `browserAgent?: (request) => Promise<BrowserAgentResult>`.

**Purpose**: Web automation using natural language commands via Stagehand.

**Why MVP**: High-value automation capability; Stagehand v3 is production-ready with act/extract/observe/agent APIs.

**Props**:
```yaml
type: BrowserAgent
props:
  action: "extract"  # act | extract | observe | agent
  url: "https://example.com/products"
  instruction: "Extract all product names and prices"
  schema:  # for extract action
    type: object
    properties:
      products:
        type: array
        items:
          type: object
          properties:
            name: { type: string }
            price: { type: number }
  outputKey: "scrapedProducts"
  headless: true
  timeout: 30000
```

**Implementation Notes**:
- Integrate with [Stagehand](https://github.com/browserbase/stagehand)
- Support Browserbase cloud or local Playwright
- Four operation modes:
  - `act`: Execute actions (click, type, navigate)
  - `extract`: Pull structured data with schema validation
  - `observe`: Discover available actions on page
  - `agent`: Full autonomous browsing workflow

**Activity Interface**:
```typescript
interface BrowserAgentActivity {
  act(params: { url: string; instruction: string }): Promise<void>;
  extract<T>(params: { url: string; instruction: string; schema: Schema }): Promise<T>;
  observe(params: { url: string }): Promise<Action[]>;
  agent(params: { url: string; goal: string; maxSteps: number }): Promise<AgentResult>;
}
```

---

### 3. ComputerUseAgent

> **Status**: NOT STARTED — Consider deferring (Terminator is Windows-only; Claude computer-use requires beta API access)

**Purpose**: Desktop automation via accessibility APIs (Terminator) or vision (Claude computer-use).

**Why MVP**: Enables automation of native applications, ERP systems, legacy software.

**Props**:
```yaml
type: ComputerUseAgent
props:
  provider: "terminator"  # terminator | claude-computer-use
  instruction: "Open Excel, paste the data from clipboard, and save as report.xlsx"
  # Terminator-specific
  mcpServer: true  # Use as MCP tool with ClaudeAgent
  # Claude computer-use specific
  displayWidth: 1920
  displayHeight: 1080
  outputKey: "computerResult"
```

**Implementation Notes**:
- [Terminator](https://github.com/mediar-ai/terminator): Windows-only, uses accessibility APIs (faster, more reliable)
- Terminator MCP server can be used as a tool within ClaudeAgent
- Claude computer-use: Cross-platform, vision-based
- Consider hybrid approach: Terminator for Windows, Claude for others

**MCP Integration** (Terminator as ClaudeAgent tool):
```yaml
type: ClaudeAgent
props:
  goal: "Fill out the expense form in SAP"
  tools:
    - type: mcp
      server: "terminator"
      capabilities: ["click", "type", "screenshot", "get_element"]
```

**Activity Interface**:
```typescript
interface ComputerUseActivity {
  executeTerminator(params: {
    instruction: string;
    screenshot?: boolean;
  }): Promise<ComputerResult>;

  executeClaudeComputerUse(params: {
    instruction: string;
    display: { width: number; height: number };
  }): Promise<ComputerResult>;
}
```

---

### 4. LLMChat

> **Status**: DONE — `src/actions/llm-chat.ts` (775-line test suite)
>
> Multi-provider support (anthropic, openai, google, ollama). JSON mode with schema validation,
> variable resolution in messages/model/systemPrompt, token usage tracking.
> Activity-based: `llmChat?: (request) => Promise<LLMChatResult>`.

**Purpose**: Direct LLM completion/chat - foundation for all AI interactions.

**Why MVP**: Required building block for Summarizer, Classifier, Extractor, and custom AI logic.

**Props**:
```yaml
type: LLMChat
props:
  provider: "anthropic"  # anthropic | openai | google | ollama
  model: "claude-sonnet-4-20250514"
  messages:
    - role: system
      content: "You are a helpful assistant."
    - role: user
      content: "Summarize: ${bb.documentText}"
  temperature: 0.7
  maxTokens: 1000
  responseFormat: "text"  # text | json
  jsonSchema:  # when responseFormat is json
    type: object
    properties:
      summary: { type: string }
  outputKey: "llmResponse"
```

**Implementation Notes**:
- Multi-provider support with unified interface
- Support for streaming (future)
- JSON mode with schema validation
- Token counting and cost tracking

**Activity Interface**:
```typescript
interface LLMChatActivity {
  chat(params: {
    provider: string;
    model: string;
    messages: Message[];
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json';
    jsonSchema?: Schema;
  }): Promise<LLMResponse>;
}
```

---

### 5. VectorSearch

> **Status**: NOT STARTED

**Purpose**: Semantic similarity search over embeddings.

**Why MVP**: Essential for RAG workflows - table stakes for AI applications.

**Props**:
```yaml
type: VectorSearch
props:
  provider: "pinecone"  # pinecone | weaviate | chroma | qdrant
  index: "knowledge-base"
  query: "${bb.userQuestion}"
  topK: 5
  filter:
    category: "technical"
  includeMetadata: true
  outputKey: "searchResults"
```

**Implementation Notes**:
- Support major vector databases
- Handle embedding generation internally or accept pre-computed
- Return documents with scores and metadata

**Activity Interface**:
```typescript
interface VectorSearchActivity {
  search(params: {
    provider: string;
    index: string;
    query: string;
    topK: number;
    filter?: Record<string, unknown>;
  }): Promise<SearchResult[]>;

  upsert(params: {
    provider: string;
    index: string;
    documents: Document[];
  }): Promise<void>;
}
```

---

### 6. DocumentLoader

> **Status**: NOT STARTED

**Purpose**: Parse and chunk documents for RAG pipelines.

**Why MVP**: Required companion to VectorSearch for building knowledge bases.

**Props**:
```yaml
type: DocumentLoader
props:
  source: "${bb.filePath}"  # or URL
  type: "auto"  # auto | pdf | docx | html | markdown | csv
  chunking:
    strategy: "recursive"  # recursive | sentence | fixed
    chunkSize: 512
    chunkOverlap: 50
  metadata:
    source: "user-upload"
    category: "technical"
  outputKey: "documentChunks"
```

**Implementation Notes**:
- Support common document formats (PDF, DOCX, HTML, MD, CSV)
- Multiple chunking strategies
- Preserve document structure where possible
- Extract and preserve metadata

**Activity Interface**:
```typescript
interface DocumentLoaderActivity {
  load(params: {
    source: string;
    type?: string;
    chunking: ChunkingConfig;
    metadata?: Record<string, unknown>;
  }): Promise<DocumentChunk[]>;
}
```

---

### 7. Summarizer

> **Status**: NOT STARTED

**Purpose**: Condense long text into concise summaries.

**Why MVP**: Simple, high utility, validates the LLMChat foundation.

**Props**:
```yaml
type: Summarizer
props:
  input: "${bb.longDocument}"
  style: "bullet"  # paragraph | bullet | tldr | executive
  maxLength: 200  # words or tokens based on unit
  lengthUnit: "words"
  preserveKeyFacts: true
  outputKey: "summary"
```

**Implementation Notes**:
- Built on LLMChat
- Multiple summary styles
- Handle long documents via chunked summarization
- Optionally extract key facts/entities

**Implementation** (uses LLMChat internally):
```typescript
class Summarizer extends BaseNode {
  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    const llmChat = context.activities?.llmChat;
    const result = await llmChat.chat({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      messages: [
        { role: 'system', content: this.buildSummaryPrompt() },
        { role: 'user', content: this.props.input }
      ]
    });
    context.blackboard.set(this.props.outputKey, result.content);
    return NodeStatus.SUCCESS;
  }
}
```

---

## Phase 2: RAG & Knowledge Enhancement

### 8. HybridRetrieval

**Purpose**: Combine dense (vector) and sparse (BM25) search for better recall.

**Props**:
```yaml
type: HybridRetrieval
props:
  query: "${bb.userQuestion}"
  vectorSearch:
    provider: "pinecone"
    index: "knowledge-base"
    weight: 0.7
  sparseSearch:
    provider: "elasticsearch"
    index: "knowledge-base-bm25"
    weight: 0.3
  topK: 10
  reranker:
    enabled: true
    model: "cohere-rerank-v3"
  outputKey: "retrievedDocs"
```

**Implementation Notes**:
- Combine vector similarity with keyword matching
- Configurable weights for each retrieval method
- Optional reranking step for improved relevance
- [Best practice for production RAG in 2026](https://redis.io/blog/rag-at-scale/)

---

### 9. Embeddings

**Purpose**: Generate text embeddings for vector operations.

**Props**:
```yaml
type: Embeddings
props:
  provider: "openai"  # openai | cohere | voyage | local
  model: "text-embedding-3-large"
  input: "${bb.textToEmbed}"
  dimensions: 1536  # optional dimension reduction
  outputKey: "embedding"
```

---

## Phase 3: Media Processing

### 10. ImageGeneration

**Purpose**: Generate images from text descriptions.

**Props**:
```yaml
type: ImageGeneration
props:
  provider: "openai"  # openai | stability | replicate
  model: "dall-e-3"
  prompt: "A futuristic city skyline at sunset, cyberpunk style"
  size: "1024x1024"
  quality: "hd"
  style: "vivid"
  outputKey: "generatedImage"  # base64 or URL
```

**Implementation Notes**:
- Support DALL-E 3, Stable Diffusion, Flux
- Handle both URL and base64 output formats
- Cost tracking per generation

---

### 11. ImageAnalysis

**Purpose**: Vision/OCR analysis of images.

**Props**:
```yaml
type: ImageAnalysis
props:
  provider: "anthropic"  # anthropic | openai
  model: "claude-sonnet-4-20250514"
  image: "${bb.imagePath}"  # path, URL, or base64
  instruction: "Extract all text from this receipt and return as JSON"
  responseFormat: "json"
  jsonSchema:
    type: object
    properties:
      merchant: { type: string }
      total: { type: number }
      items: { type: array }
  outputKey: "imageAnalysis"
```

---

### 12. SpeechToText

**Purpose**: Transcribe audio to text.

**Props**:
```yaml
type: SpeechToText
props:
  provider: "openai"  # openai | assemblyai | deepgram
  model: "whisper-1"
  audio: "${bb.audioFile}"
  language: "en"  # or "auto"
  timestamps: true
  speakerDiarization: true
  outputKey: "transcript"
```

**Implementation Notes**:
- Support Whisper, AssemblyAI, Deepgram
- Speaker diarization for multi-speaker audio
- Timestamp support for video captioning

---

### 13. TextToSpeech

**Purpose**: Synthesize speech from text.

**Props**:
```yaml
type: TextToSpeech
props:
  provider: "elevenlabs"  # elevenlabs | openai | google
  voice: "rachel"
  text: "${bb.textToSpeak}"
  stability: 0.5
  similarityBoost: 0.75
  outputFormat: "mp3"
  outputKey: "audioFile"
```

**Implementation Notes**:
- Support ElevenLabs, OpenAI TTS, Google Cloud TTS
- Voice cloning capabilities (ElevenLabs)
- Streaming support for real-time applications

---

## Phase 4: Utility AI Nodes

### 14. TextClassifier

**Purpose**: Categorize text into predefined labels.

**Props**:
```yaml
type: TextClassifier
props:
  input: "${bb.customerMessage}"
  labels:
    - "billing"
    - "technical_support"
    - "sales"
    - "general_inquiry"
  multiLabel: false
  confidenceThreshold: 0.7
  outputKey: "classification"
```

---

### 15. InformationExtractor

**Purpose**: Extract structured data from unstructured text.

**Props**:
```yaml
type: InformationExtractor
props:
  input: "${bb.emailBody}"
  schema:
    type: object
    properties:
      senderName: { type: string }
      senderCompany: { type: string }
      requestType: { type: string }
      deadline: { type: string, format: date }
      keyPoints: { type: array, items: { type: string } }
  outputKey: "extractedInfo"
```

---

### 16. Translator

**Purpose**: Translate text between languages.

**Props**:
```yaml
type: Translator
props:
  input: "${bb.sourceText}"
  sourceLanguage: "auto"
  targetLanguage: "es"
  preserveFormatting: true
  glossary:
    "behavior tree": "árbol de comportamiento"
  outputKey: "translatedText"
```

---

## Phase 5: Advanced Orchestration

### 17. AgentRouter

**Purpose**: Route requests to specialized agents based on intent.

**Props**:
```yaml
type: AgentRouter
props:
  input: "${bb.userRequest}"
  agents:
    - name: "data_analyst"
      description: "Handles data analysis, charts, and reports"
      node: "data-analyst-subtree"
    - name: "customer_support"
      description: "Handles customer inquiries and issues"
      node: "support-subtree"
    - name: "developer"
      description: "Handles code generation and technical tasks"
      node: "developer-subtree"
  fallback: "general-assistant-subtree"
  outputKey: "selectedAgent"
```

**Implementation Notes**:
- LLM-based intent classification
- Route to SubTree nodes
- [Gatekeeper pattern from n8n](https://hatchworks.com/blog/ai-agents/n8n-guide/)

---

### 18. ToolSelector

**Purpose**: Let LLM dynamically choose which tool/node to execute.

**Props**:
```yaml
type: ToolSelector
props:
  goal: "${bb.userGoal}"
  availableTools:
    - name: "search_web"
      description: "Search the internet for information"
      node: "web-search-node"
    - name: "query_database"
      description: "Query internal database"
      node: "db-query-node"
    - name: "generate_report"
      description: "Generate formatted reports"
      node: "report-generator-node"
  maxIterations: 5
  outputKey: "toolResult"
```

---

### 19. MemoryStore

**Purpose**: Persistent conversation and context memory.

**Props**:
```yaml
type: MemoryStore
props:
  operation: "save"  # save | retrieve | clear
  memoryType: "conversation"  # conversation | summary | entity
  sessionId: "${bb.sessionId}"
  # For save
  messages: "${bb.newMessages}"
  # For retrieve
  limit: 10
  outputKey: "memoryContext"
```

**Implementation Notes**:
- Short-term (conversation buffer) and long-term (summary) memory
- Entity memory for tracking key information
- Integration with vector stores for semantic memory

---

### 20. ReflectionLoop

**Purpose**: Self-critique and iterative improvement.

**Props**:
```yaml
type: ReflectionLoop
props:
  input: "${bb.generatedContent}"
  criteria:
    - "Is the response accurate and factual?"
    - "Is the tone appropriate for the audience?"
    - "Are there any logical inconsistencies?"
  maxIterations: 3
  improvementThreshold: 0.8
  outputKey: "refinedContent"
```

---

## Architecture Considerations

### Activity-Based Execution

All AI nodes should use the activity pattern for Temporal compatibility:

```typescript
// In workflow context
const activities = {
  llmChat: proxyActivities<LLMChatActivity>({ startToCloseTimeout: '60s' }),
  browserAgent: proxyActivities<BrowserAgentActivity>({ startToCloseTimeout: '120s' }),
  vectorSearch: proxyActivities<VectorSearchActivity>({ startToCloseTimeout: '30s' }),
};

// Pass to tree execution
const result = await tree.toWorkflow()({
  input: { query: 'user question' },
  activities
});
```

### Credential Management

AI nodes require API keys and credentials. Use the existing `tokenProvider` pattern:

```typescript
interface AITokenProvider {
  getToken(provider: 'anthropic' | 'openai' | 'pinecone' | ...): Promise<string>;
}
```

### Error Handling

AI operations are prone to rate limits, timeouts, and transient failures:

```typescript
// Built-in retry with exponential backoff
type: Sequence
children:
  - type: Recovery
    props:
      maxRetries: 3
      retryDelayMs: 1000
      backoffMultiplier: 2
    children:
      - type: LLMChat
        props: { ... }
```

### Cost Tracking

Add optional cost tracking to observability:

```typescript
interface AINodeMetrics {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
}
```

---

## File Structure

> **Note**: The originally planned `src/ai/` directory was not used. AI nodes follow the same
> convention as all other action nodes — they live in `src/actions/` with co-located schemas
> and tests. This keeps the project flat and consistent.

```
src/actions/
├── llm-chat.ts              # ✅ LLMChat node
├── llm-chat.schema.ts       # ✅ Zod schema
├── llm-chat.test.ts         # ✅ Tests
├── browser-agent.ts         # ✅ BrowserAgent node
├── browser-agent.schema.ts  # ✅ Zod schema
├── browser-agent.test.ts    # ✅ Tests
├── claude-agent.ts          # ✅ ClaudeAgent node
├── claude-agent.schema.ts   # ✅ Zod schema
├── claude-agent.test.ts     # ✅ Tests
├── github-action.ts         # ✅ GitHubAction node
├── github-action.schema.ts  # ✅ Zod schema
├── github-action.test.ts    # ✅ Tests
├── summarizer.ts            # Planned
├── text-classifier.ts       # Planned
├── information-extractor.ts # Planned
├── vector-search.ts         # Planned
├── document-loader.ts       # Planned
├── embeddings.ts            # Planned
├── image-generation.ts      # Planned
├── image-analysis.ts        # Planned
└── ...
```

---

## Implementation Order

### Phase 1: MVP (Weeks 1-4)
1. ~~**LLMChat** - Foundation for all AI interactions~~ ✅ DONE
2. ~~**ClaudeAgent** - Core agent capability~~ ✅ DONE
3. ~~**BrowserAgent** - High-value automation~~ ✅ DONE
4. **ComputerUseAgent** - Desktop automation (Terminator MCP) — *consider deferring*
5. **VectorSearch + DocumentLoader** - RAG foundation
6. **Summarizer** - Simple utility node

### Phase 2: RAG Enhancement (Weeks 5-6)
7. **HybridRetrieval**
8. **Embeddings**

### Phase 3: Media (Weeks 7-8)
9. **ImageGeneration**
10. **ImageAnalysis**
11. **SpeechToText**
12. **TextToSpeech**

### Phase 4: Utilities (Weeks 9-10)
13. **TextClassifier**
14. **InformationExtractor**
15. **Translator**

### Phase 5: Orchestration (Weeks 11-12)
16. **AgentRouter**
17. **ToolSelector**
18. **MemoryStore**
19. **ReflectionLoop**

---

## External Dependencies

| Node | Primary Dependency | Notes |
|------|-------------------|-------|
| ClaudeAgent | `@anthropic-ai/claude-agent-sdk` | Claude Agent SDK |
| BrowserAgent | `@browserbasehq/stagehand` | Stagehand v3 |
| ComputerUseAgent | `@mediar-ai/terminator` | Windows; MCP server |
| LLMChat | `@anthropic-ai/sdk`, `openai` | Multi-provider |
| VectorSearch | `@pinecone-database/pinecone` | Or other providers |
| DocumentLoader | `pdf-parse`, `mammoth` | Document parsing |
| ImageGeneration | `openai` | DALL-E API |
| SpeechToText | `openai` | Whisper API |
| TextToSpeech | `elevenlabs` | Or OpenAI TTS |

---

## Supporting Non-AI Nodes Backlog

These non-AI nodes are needed to enable production workflow use cases (e.g., the dev workflow where ClaudeAgent implements features and creates PRs).

### WaitForSignal

**Purpose**: Pause workflow execution until an external signal is received (e.g., PR approved webhook, human approval callback).

**Why needed**: Currently the only way to wait for external events is polling (While + HttpRequest + Delay). WaitForSignal maps directly to Temporal signals for durable, event-driven workflows without wasting compute.

**Use case**: Wait for PR approval, wait for human review, wait for deployment completion.

### Notification

**Purpose**: Send notifications via Slack, email, or arbitrary webhook when a workflow reaches a milestone.

**Why needed**: Can be approximated with HttpRequest today, but a dedicated node provides cleaner YAML, built-in templates, and multi-channel support.

**Use case**: Notify team when PR is ready for review, alert on workflow failure, send completion summary.

### GitHubAction ✅ DONE

**Purpose**: Dedicated node for common GitHub operations (create branch, create PR, merge PR, check status, add labels/reviewers).

**Why needed**: Currently achievable via ClaudeAgent+Bash or HttpRequest, but a lightweight dedicated node is cheaper (no LLM cost), faster, and more predictable for deterministic git operations.

**Use case**: Create feature branch, open PR with template, merge after approval, add reviewers.

**Implementation**: `src/actions/github-action.ts` — 10 operations (createBranch, createPullRequest, getPullRequest, mergePullRequest, closePullRequest, createReview, listIssues, addLabels, createComment, createRelease). Activity-based, variable resolution in repo and params.

---

## References

- [Stagehand - AI Browser Automation](https://github.com/browserbase/stagehand)
- [Terminator - Windows Computer Use](https://github.com/mediar-ai/terminator)
- [n8n AI Agents](https://n8n.io/ai-agents/)
- [Flowise AI](https://flowiseai.com/)
- [Stack AI](https://www.stack-ai.com/)
- [RAG at Scale 2026](https://redis.io/blog/rag-at-scale/)
- [Voice AI Stack 2026](https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents)
- [Langflow vs Flowise Comparison](https://www.leanware.co/insights/compare-langflow-vs-flowise)
