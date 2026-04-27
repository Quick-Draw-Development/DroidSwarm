import { NextResponse } from 'next/server';

import { approveEvolutionProposal, proposeSkillEvolution } from '@shared-skills';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    action?: 'propose' | 'approve';
    targetSkill?: string;
    proposalId?: string;
    projectId?: string;
  };

  try {
    switch (body.action) {
      case 'propose':
        return NextResponse.json({
          proposal: proposeSkillEvolution({
            projectId: body.projectId,
            proposedBy: 'dashboard',
            targetSkill: body.targetSkill,
          }),
        });
      case 'approve':
        if (!body.proposalId) {
          return NextResponse.json({ error: 'Missing proposal id.' }, { status: 400 });
        }
        return NextResponse.json({
          proposal: approveEvolutionProposal(body.proposalId),
        });
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Evolution action failed.',
    }, { status: 500 });
  }
}
