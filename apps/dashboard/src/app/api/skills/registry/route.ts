import { NextResponse } from 'next/server';

import {
  approveRegisteredSkill,
  approveSpecializedAgent,
  createAgentManifest,
  createSkillScaffold,
  resolveSkillsRoot,
} from '@shared-skills';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    action?: 'create-skill' | 'approve-skill' | 'create-agent' | 'approve-agent';
    name?: string;
    template?: 'basic' | 'research' | 'code' | 'review' | 'custom';
    skills?: string[];
    priority?: 'low' | 'medium' | 'high';
  };

  try {
    switch (body.action) {
      case 'create-skill':
        if (!body.name) {
          return NextResponse.json({ error: 'Missing skill name.' }, { status: 400 });
        }
        return NextResponse.json({
          skill: createSkillScaffold({
            rootDir: resolveSkillsRoot(),
            name: body.name,
            template: body.template ?? 'basic',
          }),
        });
      case 'approve-skill':
        if (!body.name) {
          return NextResponse.json({ error: 'Missing skill name.' }, { status: 400 });
        }
        return NextResponse.json({ skill: approveRegisteredSkill(body.name) });
      case 'create-agent':
        if (!body.name || !Array.isArray(body.skills) || body.skills.length === 0) {
          return NextResponse.json({ error: 'Missing agent name or skills.' }, { status: 400 });
        }
        return NextResponse.json({
          agent: createAgentManifest({
            skillsRoot: resolveSkillsRoot(),
            name: body.name,
            skills: body.skills,
            priority: body.priority ?? 'medium',
          }),
        });
      case 'approve-agent':
        if (!body.name) {
          return NextResponse.json({ error: 'Missing agent name.' }, { status: 400 });
        }
        return NextResponse.json({ agent: approveSpecializedAgent(body.name) });
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Skills registry action failed.',
    }, { status: 500 });
  }
}
