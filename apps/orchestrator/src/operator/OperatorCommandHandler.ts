import { runCodexPrompt } from '../codex-runner';
import type { OrchestratorConfig } from '../types';

export class OperatorCommandHandler {
  constructor(private readonly config: OrchestratorConfig) {}

  async process(content: string): Promise<string> {
    const instructionSections = [
      this.config.orchestratorRules
        ? `Orchestrator rules:\n${this.config.orchestratorRules}\n`
        : undefined,
      this.config.droidspeakRules
        ? `Droidspeak reference (droidspeak-v1):\n${this.config.droidspeakRules}\n`
        : undefined,
    ].filter(Boolean);
    const promptParts = [
      ...instructionSections,
      `You are ${this.config.agentName}, the DroidSwarm orchestrator for project ${this.config.projectName}.`,
      'Respond to the human operator message succinctly.',
      'If the message is an instruction, acknowledge it and state the next orchestration action.',
      'Do not fabricate task state or claim work that has not happened.',
      'Return a structured result with no spawned agents unless the operator explicitly asks for a new task workflow.',
      '',
      `Operator message: ${content}`,
    ];

    const result = await runCodexPrompt({
      config: this.config,
      projectRoot: this.config.projectRoot,
      prompt: promptParts.join('\n'),
    });
    return result.summary;
  }
}
