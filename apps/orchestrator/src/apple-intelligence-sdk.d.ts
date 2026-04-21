declare module '@apple-intelligence/sdk' {
  export class AppleIntelligenceClient {
    constructor(config?: Record<string, unknown>);
    processTask(sessionId: string, name: string, payload: Record<string, unknown>): Promise<{ data: unknown }>;
  }
}
