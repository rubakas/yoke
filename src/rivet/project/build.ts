// FR-004 / FR-005: programmatic Rivet project builder for the spec-creation workflow.

import { globalRivetNodeRegistry } from "@ironclad/rivet-node";
import type { ModelRegistry } from "../registry.js";
import type {
  ChartNode,
  GraphId,
  NodeConnection,
  NodeId,
  PortId,
  Project,
  ProjectId,
} from "@ironclad/rivet-node";

// ── Public types ──────────────────────────────────────────────────────────────

export interface BuildOptions {
  registry: ModelRegistry;
  models?: {
    intake?: string;
    enrich?: string;
    critic?: string;
    security?: string;
  };
}

export const STEP_IDS = {
  intake: "yoke-step-intake",
  enrich: "yoke-step-enrich",
  critic: "yoke-step-critic",
  security: "yoke-step-security",
  approve: "yoke-step-approve",
  createTicket: "yoke-step-create-ticket",
} as const;

// ── Prompt templates ──────────────────────────────────────────────────────────

const INTAKE_PROMPT =
  "You are a product analyst. Produce a concise spec draft with a # Title heading, description, " +
  "3-7 requirements, and 3-5 acceptance criteria for: {{request}}";

const ENRICH_PROMPT =
  "Enrich this spec: add missing edge cases, non-functional requirements, and clarify ambiguities. " +
  "Keep the # Title heading. Return the improved spec as markdown.\n\nSpec:\n{{spec}}";

const CRITIC_PROMPT =
  "You are an adversarial critic. Review this spec for weaknesses — gaps, ambiguities, " +
  "missing edge cases. Respond with STRICT JSON only, no markdown fences: " +
  '{"weaknesses":[{"text":"...","severity":"low|medium|high","blocking":false}]}\n\n' +
  "Spec to review:\n{{spec}}";

const SECURITY_PROMPT =
  "You are a security analyst. Review this spec for security risks. " +
  "Respond with STRICT JSON only, no markdown fences: " +
  '{"securityFindings":[{"text":"...","severity":"low|medium|high|critical","blocking":false}]}\n\n' +
  "Spec to review:\n{{spec}}";

// ── Node/connection helpers ───────────────────────────────────────────────────

function makeNode(type: string, id: string, x: number, y: number): ChartNode {
  const n = globalRivetNodeRegistry.create(
    type as Parameters<typeof globalRivetNodeRegistry.create>[0]
  );
  n.id = id as NodeId;
  n.visualData = { x, y, width: n.visualData.width ?? 300 };
  return n;
}

function conn(fromId: string, fromPort: string, toId: string, toPort: string): NodeConnection {
  return {
    outputNodeId: fromId as NodeId,
    outputId: fromPort as PortId,
    inputNodeId: toId as NodeId,
    inputId: toPort as PortId,
  };
}

// ── stepNode: builds the nodes/connections for one pipeline step ──────────────

interface StepBuild {
  nodes: ChartNode[];
  /** ID of the Text/prompt node (upstream must connect to its template var port) */
  promptNodeId: string;
  /** Port name on the prompt node that accepts upstream input (e.g. "spec" or "request") */
  promptInputPort: string;
  /** ID of the node that produces the step's output */
  outputNodeId: string;
  /** Port name on the output node ("result" for ExternalCall, "response" for Chat) */
  outputPort: "result" | "response";
  /** Connections internal to this step */
  internalConns: NodeConnection[];
}

function buildCliStep(
  stepId: string,
  title: string,
  promptTemplate: string,
  modelId: string,
  templateVar: string,
  x: number,
  y: number
): StepBuild {
  const promptNodeId = `yoke-helper-${stepId.replace("yoke-step-", "")}-prompt`;
  const modelNodeId = `yoke-helper-${stepId.replace("yoke-step-", "")}-modelid`;
  const argsNodeId = `yoke-helper-${stepId.replace("yoke-step-", "")}-args`;

  const promptNode = makeNode("text", promptNodeId, x, y - 120);
  promptNode.title = `${title} Prompt`;
  (promptNode.data as Record<string, unknown>).text = promptTemplate;

  const modelNode = makeNode("text", modelNodeId, x, y + 120);
  modelNode.title = `${title} Model`;
  (modelNode.data as Record<string, unknown>).text = modelId;

  const argsNode = makeNode("array", argsNodeId, x + 350, y);
  argsNode.title = `${title} Args`;

  const stepNode = makeNode("externalCall", stepId, x + 700, y);
  stepNode.title = title;
  (stepNode.data as Record<string, unknown>).functionName = "runClaudeCli";
  (stepNode.data as Record<string, unknown>).useFunctionNameInput = false;

  return {
    nodes: [promptNode, modelNode, argsNode, stepNode],
    promptNodeId,
    promptInputPort: templateVar,
    outputNodeId: stepId,
    outputPort: "result",
    internalConns: [
      conn(promptNodeId, "output", argsNodeId, "input1"),
      conn(modelNodeId, "output", argsNodeId, "input2"),
      conn(argsNodeId, "output", stepId, "arguments"),
    ],
  };
}

function buildApiStep(
  stepId: string,
  title: string,
  promptTemplate: string,
  endpoint: string,
  model: string,
  templateVar: string,
  x: number,
  y: number
): StepBuild {
  const promptNodeId = `yoke-helper-${stepId.replace("yoke-step-", "")}-prompt`;

  const promptNode = makeNode("text", promptNodeId, x, y - 60);
  promptNode.title = `${title} Prompt`;
  (promptNode.data as Record<string, unknown>).text = promptTemplate;

  const chatNode = makeNode("chat", stepId, x + 350, y);
  chatNode.title = title;
  (chatNode.data as Record<string, unknown>).endpoint = endpoint;
  (chatNode.data as Record<string, unknown>).overrideModel = model;

  return {
    nodes: [promptNode, chatNode],
    promptNodeId,
    promptInputPort: templateVar,
    outputNodeId: stepId,
    outputPort: "response",
    internalConns: [conn(promptNodeId, "output", stepId, "prompt")],
  };
}

function buildStep(
  stepId: string,
  title: string,
  promptTemplate: string,
  modelId: string,
  templateVar: string,
  registry: ModelRegistry,
  x: number,
  y: number
): StepBuild {
  const entry = registry.resolve(modelId);
  if (entry.transport === "api" && entry.api) {
    return buildApiStep(
      stepId,
      title,
      promptTemplate,
      entry.api.endpoint,
      entry.api.model ?? "default",
      templateVar,
      x,
      y
    );
  }
  return buildCliStep(stepId, title, promptTemplate, modelId, templateVar, x, y);
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildSpecCreationProject(opts: BuildOptions): Project {
  const { registry, models = {} } = opts;

  const intakeModelId = models.intake ?? "claude-sonnet";
  const enrichModelId = models.enrich ?? "ollama-qwen";
  const criticModelId = models.critic ?? "claude-sonnet";
  const securityModelId = models.security ?? "claude-sonnet";

  const nodes: ChartNode[] = [];
  const connections: NodeConnection[] = [];

  function add(n: ChartNode) {
    nodes.push(n);
    return n;
  }
  function addConn(fromId: string, fromPort: string, toId: string, toPort: string) {
    connections.push(conn(fromId, fromPort, toId, toPort));
  }
  function addStep(step: StepBuild) {
    for (const n of step.nodes) add(n);
    for (const c of step.internalConns) connections.push(c);
  }

  // ── Graph Input ──────────────────────────────────────────────────────────────
  const graphInput = makeNode("graphInput", "yoke-helper-graph-input", 0, 400);
  graphInput.title = "Request Input";
  (graphInput.data as Record<string, unknown>).id = "request";
  (graphInput.data as Record<string, unknown>).dataType = "string";
  add(graphInput);

  // ── Intake ───────────────────────────────────────────────────────────────────
  const intake = buildStep(
    STEP_IDS.intake,
    "intake",
    INTAKE_PROMPT,
    intakeModelId,
    "request",
    registry,
    350,
    400
  );
  addStep(intake);
  addConn("yoke-helper-graph-input", "data", intake.promptNodeId, "request");

  // ── Enrich ───────────────────────────────────────────────────────────────────
  const enrich = buildStep(
    STEP_IDS.enrich,
    "enrich",
    ENRICH_PROMPT,
    enrichModelId,
    "spec",
    registry,
    1400,
    200
  );
  addStep(enrich);
  addConn(intake.outputNodeId, intake.outputPort, enrich.promptNodeId, "spec");

  // ── Critic ───────────────────────────────────────────────────────────────────
  const critic = buildStep(
    STEP_IDS.critic,
    "critic",
    CRITIC_PROMPT,
    criticModelId,
    "spec",
    registry,
    1400,
    700
  );
  addStep(critic);
  addConn(enrich.outputNodeId, enrich.outputPort, critic.promptNodeId, "spec");

  // ── Security ─────────────────────────────────────────────────────────────────
  const security = buildStep(
    STEP_IDS.security,
    "security",
    SECURITY_PROMPT,
    securityModelId,
    "spec",
    registry,
    1400,
    1200
  );
  addStep(security);
  addConn(enrich.outputNodeId, enrich.outputPort, security.promptNodeId, "spec");

  // ── Assemble (Code node) ──────────────────────────────────────────────────────
  const assembleId = "yoke-helper-assemble";
  const assembleNode = makeNode("code", assembleId, 2800, 700);
  assembleNode.title = "assemble";
  const assembleCode = `
function parseJson(s) {
  try {
    return JSON.parse(
      String(s ?? '').replace(/^\`\`\`(?:json)?\\s*/m, '').replace(/\\s*\`\`\`\\s*$/m, '').trim()
    );
  } catch (e) { console.error("assemble: JSON parse failed:", e); return null; }
}
const enrichText = String(inputs.enrich?.value ?? '');
const criticText = String(inputs.critic?.value ?? '');
const securityText = String(inputs.security?.value ?? '');
const titleMatch = enrichText.match(/^#+\\s+(.+)$/m) ?? enrichText.match(/^(.+)$/m);
const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
const criticData = parseJson(criticText);
const secData = parseJson(securityText);
const spec = {
  title,
  description: enrichText,
  requirements: [],
  acceptanceCriteria: [],
  weaknesses: criticData?.weaknesses ?? [],
  securityFindings: secData?.securityFindings ?? secData?.findings ?? []
};
return { spec: { type: 'string', value: JSON.stringify(spec) } };
`.trim();
  (assembleNode.data as Record<string, unknown>).code = assembleCode;
  (assembleNode.data as Record<string, unknown>).inputNames = ["enrich", "critic", "security"];
  (assembleNode.data as Record<string, unknown>).outputNames = ["spec"];
  add(assembleNode);

  addConn(enrich.outputNodeId, enrich.outputPort, assembleId, "enrich");
  addConn(critic.outputNodeId, critic.outputPort, assembleId, "critic");
  addConn(security.outputNodeId, security.outputPort, assembleId, "security");

  // ── Approve (User Input) ──────────────────────────────────────────────────────
  const approvePromptId = "yoke-helper-approve-prompt";
  const approvePromptNode = makeNode("text", approvePromptId, 3300, 600);
  approvePromptNode.title = "Approve Prompt";
  (approvePromptNode.data as Record<string, unknown>).text =
    "Approve this hardened spec? (yes/no)\n\n{{spec}}";
  add(approvePromptNode);
  addConn(assembleId, "spec", approvePromptId, "spec");

  const approveArrayId = "yoke-helper-approve-array";
  const approveArrayNode = makeNode("array", approveArrayId, 3650, 700);
  approveArrayNode.title = "Approve Questions";
  add(approveArrayNode);
  addConn(approvePromptId, "output", approveArrayId, "input1");

  const approveNode = makeNode("userInput", STEP_IDS.approve, 4000, 700);
  approveNode.title = "approve";
  (approveNode.data as Record<string, unknown>).useInput = true;
  add(approveNode);
  addConn(approveArrayId, "output", STEP_IDS.approve, "questions");

  // ── Gate (Code node checks yes/no) ────────────────────────────────────────────
  const gateId = "yoke-helper-gate";
  const gateNode = makeNode("code", gateId, 4400, 700);
  gateNode.title = "Gate";
  const gateCode = `
const answers = inputs.answer?.value;
const first = (Array.isArray(answers) ? (answers[0] ?? '') : String(answers ?? '')).trim().toLowerCase();
return { approved: { type: 'boolean', value: first.startsWith('y') } };
`.trim();
  (gateNode.data as Record<string, unknown>).code = gateCode;
  (gateNode.data as Record<string, unknown>).inputNames = ["answer"];
  (gateNode.data as Record<string, unknown>).outputNames = ["approved"];
  add(gateNode);
  addConn(STEP_IDS.approve, "output", gateId, "answer");

  // ── If node (gates create-ticket) ─────────────────────────────────────────────
  const gateIfId = "yoke-helper-gate-if";
  const gateIfNode = makeNode("if", gateIfId, 4750, 700);
  gateIfNode.title = "If Approved";
  add(gateIfNode);
  addConn(gateId, "approved", gateIfId, "if");

  // ── Create-ticket args array ───────────────────────────────────────────────────
  const ctArrayId = "yoke-helper-ct-array";
  const ctArrayNode = makeNode("array", ctArrayId, 4750, 550);
  ctArrayNode.title = "Ticket Args";
  add(ctArrayNode);
  addConn(assembleId, "spec", ctArrayId, "input1");
  addConn(ctArrayId, "output", gateIfId, "value");

  // ── Create Ticket ─────────────────────────────────────────────────────────────
  const createTicketNode = makeNode("externalCall", STEP_IDS.createTicket, 5100, 700);
  createTicketNode.title = "create-ticket";
  (createTicketNode.data as Record<string, unknown>).functionName = "persistTicket";
  (createTicketNode.data as Record<string, unknown>).useFunctionNameInput = false;
  add(createTicketNode);
  addConn(gateIfId, "output", STEP_IDS.createTicket, "arguments");

  // ── Graph Outputs ─────────────────────────────────────────────────────────────
  const outSpec = makeNode("graphOutput", "yoke-helper-out-spec", 5600, 400);
  outSpec.title = "spec output";
  (outSpec.data as Record<string, unknown>).id = "spec";
  (outSpec.data as Record<string, unknown>).dataType = "string";
  add(outSpec);
  addConn(assembleId, "spec", "yoke-helper-out-spec", "value");

  const outApproved = makeNode("graphOutput", "yoke-helper-out-approved", 5600, 700);
  outApproved.title = "approved output";
  (outApproved.data as Record<string, unknown>).id = "approved";
  (outApproved.data as Record<string, unknown>).dataType = "boolean";
  add(outApproved);
  addConn(gateId, "approved", "yoke-helper-out-approved", "value");

  const outTicket = makeNode("graphOutput", "yoke-helper-out-ticket", 5600, 1000);
  outTicket.title = "ticketId output";
  (outTicket.data as Record<string, unknown>).id = "ticketId";
  (outTicket.data as Record<string, unknown>).dataType = "number";
  add(outTicket);
  addConn(STEP_IDS.createTicket, "result", "yoke-helper-out-ticket", "value");

  // ── Assemble project ──────────────────────────────────────────────────────────
  const graphId = "yoke-spec-creation" as GraphId;

  return {
    metadata: {
      id: "yoke-spec-creation-project" as ProjectId,
      title: "Yoke Spec Creation",
      description:
        "6-step spec-creation workflow: intake → enrich → critic → security → approve → create-ticket",
      mainGraphId: graphId,
    },
    graphs: {
      [graphId]: {
        metadata: { id: graphId, name: "spec-creation" },
        nodes,
        connections,
      },
    },
  };
}
