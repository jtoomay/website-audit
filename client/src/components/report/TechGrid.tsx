import { useState } from 'react';
import type { DetectedTech } from '../../../../shared/report';

function TechIcon({ tech }: { tech: DetectedTech }) {
  const [failed, setFailed] = useState(false);
  if (!tech.iconUrl || failed) {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-paper text-xs font-semibold text-muted">
        {tech.name.slice(0, 2)}
      </span>
    );
  }
  return (
    <img src={tech.iconUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="size-8 shrink-0 rounded-md object-contain p-0.5" />
  );
}

function TechCard({ tech }: { tech: DetectedTech }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="flex items-start gap-3">
        <TechIcon tech={tech} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {tech.website ? (
              <a href={tech.website} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">
                {tech.name}
              </a>
            ) : (
              <span className="font-medium">{tech.name}</span>
            )}
            {tech.version && <span className="font-mono text-xs text-muted">{tech.version}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {tech.confidence < 100 && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">{tech.confidence}% sure</span>}
            {tech.impliedBy && <span className="rounded bg-paper px-1.5 py-0.5 text-muted">via {tech.impliedBy.join(', ')}</span>}
            {tech.oss && <span className="rounded bg-paper px-1.5 py-0.5 text-muted">open source</span>}
            {tech.pricing?.includes('high') && <span className="rounded bg-paper px-1.5 py-0.5 text-muted">$$$</span>}
            <button onClick={() => setOpen(!open)} className="no-print text-muted underline-offset-2 hover:text-accent hover:underline">
              {open ? 'hide evidence' : 'why?'}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-1 border-t border-line pt-2">
          {tech.description && <p className="pb-1 text-xs text-muted">{tech.description}</p>}
          {tech.evidence.map((e, i) => (
            <p key={i} className="break-all font-mono text-[11px] text-muted">
              <span className="text-ink">{e.type}</span>
              {e.key ? ` ${e.key}` : ''}: {e.match}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TechGrid({ technologies }: { technologies: DetectedTech[] }) {
  // Group by each tech's primary (highest-priority) category, keeping category order.
  const groups = new Map<string, { priority: number; techs: DetectedTech[] }>();
  for (const t of technologies) {
    const cat = t.categories[0] ?? { name: 'Other', priority: 99 };
    if (!groups.has(cat.name)) groups.set(cat.name, { priority: cat.priority, techs: [] });
    groups.get(cat.name)!.techs.push(t);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[1].priority - b[1].priority || b[1].techs.length - a[1].techs.length);

  if (!technologies.length) {
    return <p className="card p-6 text-sm text-muted">No technologies were detected.</p>;
  }
  return (
    <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
      {ordered.map(([name, g]) => (
        <section key={name} className="mb-4 break-inside-avoid">
          <h3 className="eyebrow mb-2">
            {name} <span className="font-normal">· {g.techs.length}</span>
          </h3>
          <div className="space-y-2">
            {g.techs.map((t) => (
              <TechCard key={t.name} tech={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
