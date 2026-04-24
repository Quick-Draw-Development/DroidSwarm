import { NextResponse } from 'next/server';
import { approveLawProposal, listActiveLaws, listLawProposals, rejectLawProposal, runGovernanceDebate, validateCompliance } from '@shared-governance';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    laws: listActiveLaws().map((law) => ({
      id: law.id,
      title: law.title,
      description: law.description,
      version: law.version,
    })),
    proposals: listLawProposals(),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json() as {
    action?: 'propose' | 'approve' | 'reject';
    proposalId?: string;
    title?: string;
    description?: string;
    rationale?: string;
    approvedBy?: string;
  };

  const compliance = validateCompliance({
    eventType: 'governance.proposal',
    actorRole: 'dashboard',
    swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
    projectId: process.env.DROIDSWARM_PROJECT_ID,
    auditLoggingEnabled: true,
    dashboardEnabled: true,
    droidspeakState: body.action === 'propose'
      ? { compact: 'EVT-LAW-PROPOSAL', expanded: body.description ?? '', kind: 'memory_pinned' }
      : undefined,
  });
  if (!compliance.ok) {
    return NextResponse.json({
      error: compliance.laws.filter((entry) => !entry.ok).map((entry) => entry.violations.join(' ')).join(' '),
    }, { status: 400 });
  }

  if (body.action === 'propose') {
    if (!body.title || !body.description || !body.rationale) {
      return NextResponse.json({ error: 'Missing proposal fields' }, { status: 400 });
    }
    const debate = runGovernanceDebate({
      lawId: `LAW-${String(listLawProposals().length + 6).padStart(3, '0')}`,
      title: body.title,
      description: body.description,
      rationale: body.rationale,
      glyph: 'EVT-LAW-PROPOSAL',
      proposedBy: 'dashboard-admin',
      context: {
        eventType: 'governance.proposal',
        actorRole: 'planner',
        swarmRole: 'master',
        projectId: process.env.DROIDSWARM_PROJECT_ID,
        auditLoggingEnabled: true,
        dashboardEnabled: true,
        droidspeakState: { compact: 'EVT-LAW-PROPOSAL', expanded: body.description, kind: 'memory_pinned' },
      },
    });
    return NextResponse.json({ debate });
  }

  if (!body.proposalId) {
    return NextResponse.json({ error: 'Missing proposal id' }, { status: 400 });
  }

  if (body.action === 'approve') {
    return NextResponse.json({
      proposal: approveLawProposal(body.proposalId, {
        approvedBy: body.approvedBy ?? 'dashboard-admin',
        comment: 'Approved from dashboard.',
      }),
    });
  }

  if (body.action === 'reject') {
    return NextResponse.json({
      proposal: rejectLawProposal(body.proposalId, {
        rejectedBy: body.approvedBy ?? 'dashboard-admin',
        comment: 'Rejected from dashboard.',
      }),
    });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
