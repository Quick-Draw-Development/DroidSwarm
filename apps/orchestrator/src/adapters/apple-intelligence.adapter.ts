import { AgentAdapter, TaskContext, ToolInvocation } from '../types';
import { AppleIntelligenceClient } from '@apple-intelligence/sdk';

/**
 * Adapter for the Apple Intelligence Agent.
 * Handles task routing and execution using the specialized Apple SDK.
 */
export class AppleIntelligenceAdapter implements AgentAdapter {
  private client: AppleIntelligenceClient;

  constructor(_taskContext: TaskContext) {
    this.client = new AppleIntelligenceClient({
    });
  }

  /**
   * Executes the task using the Apple Intelligence SDK.
   * @param taskContext Contextual information about the task.
   * @param invocation Details of the task invocation.
   * @returns Result from the Apple Intelligence system.
   */
  async executeTask(taskContext: TaskContext, invocation: ToolInvocation): Promise<any> {
    console.log(`[Apple Intelligence Adapter] Routing task ${invocation.name} via Apple AI.`);
    
    try {
      // This is the core interaction logic.
      const result = await this.client.processTask(
        taskContext.sessionId,
        invocation.name,
        invocation.payload
      );
      return { status: 'success', result: result.data };
    } catch (error) {
      console.error('[Apple Intelligence Adapter] Error executing task:', error);
      const message = error instanceof Error ? error.message : 'unknown apple intelligence error';
      throw new Error(`Apple Intelligence API failed: ${message}`);
    }
  }

  /**
   * Determines if this adapter is appropriate for the given task.
   */
  canHandle(taskContext: TaskContext): boolean {
    // Simple check: Assume any task explicitly mentioning Apple or related keywords is suitable.
    const taskDescription = taskContext.description.toLowerCase();
    return taskDescription.includes('apple') || taskDescription.includes('ios') || taskDescription.includes('macos');
  }
}
