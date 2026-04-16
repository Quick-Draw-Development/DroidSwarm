export interface CodexExecutionRequest {
  prompt: string;
  model?: string;
  cwd: string;
}

export interface CodexExecutionPort<T> {
  execute(request: CodexExecutionRequest): Promise<T>;
}
