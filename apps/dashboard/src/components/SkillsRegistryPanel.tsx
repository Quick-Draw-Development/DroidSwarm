'use client';

import { useState, useTransition } from 'react';

import type { SkillsRegistrySummary } from '../lib/types';

export function SkillsRegistryPanel({ registry }: { registry?: SkillsRegistrySummary }) {
  const [pending, startTransition] = useTransition();
  const [skillName, setSkillName] = useState('');
  const [template, setTemplate] = useState('basic');
  const [agentName, setAgentName] = useState('');
  const [agentSkills, setAgentSkills] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!registry) {
    return null;
  }

  const submit = async (body: Record<string, unknown>) => {
    startTransition(async () => {
      const response = await fetch('/api/skills/registry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      setMessage(response.ok ? 'Registry updated.' : (payload.error as string | undefined) ?? 'Registry action failed.');
      if (response.ok && body.action === 'create-skill') {
        setSkillName('');
      }
      if (response.ok && body.action === 'create-agent') {
        setAgentName('');
        setAgentSkills('');
      }
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Skills & Agents</p>
        <span className="helper-text">
          {registry.activeSkillCount} active skills · {registry.activeAgentCount} active agents
        </span>
      </header>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Create Skill</p>
          <p className="subcopy">Scaffold a new skill pack and register it immediately.</p>
        </div>
        <input value={skillName} onChange={(event) => setSkillName(event.target.value)} placeholder="skill name" />
        <input value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="template" />
        <button type="button" onClick={() => submit({ action: 'create-skill', name: skillName.trim(), template })} disabled={pending || !skillName.trim()}>
          Create skill
        </button>
        <div>
          <p className="section-title">Create Agent</p>
          <p className="subcopy">Create a specialized agent backed by registered skills.</p>
        </div>
        <input value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="agent name" />
        <input value={agentSkills} onChange={(event) => setAgentSkills(event.target.value)} placeholder="skill1,skill2" />
        <button
          type="button"
          onClick={() => submit({
            action: 'create-agent',
            name: agentName.trim(),
            skills: agentSkills.split(',').map((entry) => entry.trim()).filter(Boolean),
          })}
          disabled={pending || !agentName.trim() || !agentSkills.trim()}
        >
          Create agent
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {registry.skills.map((skill) => (
          <li key={skill.name} className="insight-item">
            <strong>{skill.name}</strong>
            <span>{skill.status} · {skill.capabilities.join(', ') || 'no capabilities declared'}</span>
            {skill.status === 'pending-approval' ? (
              <button type="button" onClick={() => submit({ action: 'approve-skill', name: skill.name })} disabled={pending}>Approve</button>
            ) : null}
          </li>
        ))}
        {registry.agents.map((agent) => (
          <li key={agent.name} className="insight-item">
            <strong>{agent.name}</strong>
            <span>{agent.status} · {agent.priority} · skills {agent.skills.join(', ')}</span>
            {agent.status === 'pending-approval' ? (
              <button type="button" onClick={() => submit({ action: 'approve-agent', name: agent.name })} disabled={pending}>Approve</button>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
