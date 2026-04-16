export function SkillPackList({ skills }: { skills: string[] }) {
  return (
    <section>
      <h3>Skill Packs</h3>
      <ul>
        {skills.map((skill) => <li key={skill}>{skill}</li>)}
      </ul>
    </section>
  );
}
