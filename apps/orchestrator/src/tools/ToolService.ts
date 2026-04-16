import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { OrchestratorConfig } from '../types';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type { ToolRequest, ToolResponse } from './types';
import { buildEmbedding, cosineSimilarity } from '../utils/embeddings';

const truncate = (value: string, limit = 1024): string => (value.length <= limit ? value : `${value.slice(0, limit - 3)}...`);

const ensureStringArray = (value?: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((part) => String(part));
  }
  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean);
  }
  return [];
};

export class ToolService {
  constructor(
    private readonly config: OrchestratorConfig,
    private readonly persistence: OrchestratorPersistenceService,
  ) {}

  async handleRequest(request: ToolRequest): Promise<ToolResponse> {
    this.persistence.recordExecutionEvent(
      'tool_request',
      `Tool ${request.toolName} requested`,
      {
        requestId: request.requestId,
        taskId: request.taskId,
        tool: request.toolName,
      },
    );

    let response: ToolResponse;
    try {
      switch (request.toolName) {
        case 'file_read':
          response = await this.handleFileRead(request);
          break;
        case 'file_write':
          response = await this.handleFileWrite(request);
          break;
        case 'nx_run':
          response = await this.handleNxRun(request);
          break;
        case 'web_search':
          response = await this.handleWebSearch(request);
          break;
        case 'checkpoint_search':
          response = await this.handleCheckpointSearch(request);
          break;
        default:
          throw new Error(`Unsupported tool ${request.toolName}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool execution error';
      response = {
        status: 'error',
        error: message,
      };
    }

    this.persistence.recordExecutionEvent(
      'tool_response',
      `Tool ${request.toolName} responded ${response.status}`,
      {
        requestId: request.requestId,
        taskId: request.taskId,
        tool: request.toolName,
        status: response.status,
      },
    );

    return response;
  }

  private async handleFileRead(request: ToolRequest): Promise<ToolResponse> {
    const target = this.asString(request.parameters?.path);
    if (!target) {
      throw new Error('file_read requires a path parameter');
    }
    const resolved = this.resolveProjectPath(request.taskId, target);
    const content = await fs.readFile(resolved, 'utf-8');
    return {
      status: 'success',
      result: {
        path: path.relative(this.config.projectRoot, resolved),
        content,
        summary: content.length > 512 ? `${content.slice(0, 512)}...` : content,
        size: content.length,
      },
    };
  }

  private async handleFileWrite(request: ToolRequest): Promise<ToolResponse> {
    const target = this.asString(request.parameters?.path);
    const content = this.asString(request.parameters?.content) ?? '';
    if (!target) {
      throw new Error('file_write requires a path parameter');
    }
    const resolved = this.resolveProjectPath(request.taskId, target);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
    return {
      status: 'success',
      result: {
        path: path.relative(this.config.projectRoot, resolved),
        size: content.length,
        summary: truncate(content),
      },
    };
  }

  private async handleNxRun(request: ToolRequest): Promise<ToolResponse> {
    const command = this.asString(request.parameters?.command) ?? 'npx';
    const candidateArgs = ensureStringArray(request.parameters?.args);
    const args = candidateArgs.length > 0 ? candidateArgs : ['nx', '--version'];
    const execution = await this.runCommand(request.taskId, command, args);
    return {
      status: 'success',
      result: {
        command: `${command} ${args.join(' ')}`,
        stdout: truncate(execution.stdout, 1024),
        stderr: truncate(execution.stderr, 1024),
        exitCode: execution.exitCode,
      },
    };
  }

  private async handleWebSearch(request: ToolRequest): Promise<ToolResponse> {
    const query = this.asString(request.parameters?.query);
    if (!query) {
      throw new Error('web_search requires a query parameter');
    }
    const encoded = encodeURIComponent(query);
    const url = `https://r.jina.ai/http://lite.duckduckgo.com/50x.html?q=${encoded}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }
    const text = await response.text();
    const cleaned = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      status: 'success',
      result: {
        query,
        summary: truncate(cleaned, 1024),
        source: url,
      },
    };
  }

  private async handleCheckpointSearch(request: ToolRequest): Promise<ToolResponse> {
    const query = this.asString(request.parameters?.query);
    const limit = Number(request.parameters?.limit ?? 3);
    if (!query) {
      throw new Error('checkpoint_search requires a query parameter');
    }
    const results = this.persistence.searchCheckpoints(query, Math.max(1, limit));
    const formatted = results.map((entry) => ({
      checkpointId: entry.checkpointId,
      score: entry.score,
      summary: entry.summary,
      content: entry.content,
    }));
    return {
      status: 'success',
      result: {
        query,
        matches: formatted,
      },
    };
  }

  private resolveProjectPath(taskId: string, relativePath: string): string {
    const root = this.resolveTaskRoot(taskId);
    const candidate = path.resolve(root, relativePath);
    if (!candidate.startsWith(root)) {
      throw new Error('Tool access outside of project root is forbidden');
    }
    return candidate;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }

  private resolveTaskRoot(taskId: string): string {
    const task = this.persistence.getTask(taskId);
    const root = task?.rootPath ?? this.config.projectRoot;
    const allowedRoots = this.config.allowedRepoRoots.map((entry) => path.resolve(entry));
    const resolvedRoot = path.resolve(root);
    if (!allowedRoots.some((entry) => resolvedRoot === entry || resolvedRoot.startsWith(`${entry}${path.sep}`))) {
      throw new Error(`Task root ${resolvedRoot} is outside the configured repo allowlist`);
    }
    return resolvedRoot;
  }

  private async runCommand(taskId: string, command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.resolveTaskRoot(taskId),
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf-8');
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    });
  }
}
