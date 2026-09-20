import { useEffect, useState } from 'react';
import type { Rules } from '../domain';
import Field from './Field';

const LIMIT = { min: 0, max: 1000000 };

export default function RulesForm({ rules, onSave }: { rules: Rules; onSave: (rules: Rules) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(rules));
  useEffect(() => setDraft(structuredClone(rules)), [rules]);
  const setCategory = (index: number, change: Partial<Rules['categories'][number]>) =>
    setDraft({ ...draft, categories: draft.categories.map((c, i) => i === index ? { ...c, ...change } : c) });

  return (
    <form className="panel settings-panel" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
      <h2>Categorías y puntuación</h2>
      <p className="muted">Los cambios de puntuación se aplican a los próximos resultados publicados. Los resultados anteriores conservan sus puntos.</p>
      <h3>Categorías</h3>
      {draft.categories.map((c, index) => (
        <div className="form-grid" key={index}>
          <Field label={`Categoría ${index + 1}`}><input value={c.name} required maxLength={150} onChange={e => setCategory(index, { name: e.target.value })} /></Field>
        </div>
      ))}
      <p className="muted small">Cada jugador tiene una categoría asignada. Sumar puntos no provoca ascensos; las reglas de traspaso se definirán más adelante. Los nombres deben ser distintos.</p>
      <h3>Puntos por puesto</h3>
      <div className="points-grid">
        {draft.points.map((p, index) => (
          <Field key={index} label={`${index + 1}.º puesto`}>
            <input type="number" {...LIMIT} required value={p} onChange={e => setDraft({ ...draft, points: draft.points.map((v, i) => i === index ? Number(e.target.value) : v) })} />
          </Field>
        ))}
      </div>
      <Field label="Desde el 9.º puesto"><input type="number" {...LIMIT} required value={draft.participation} onChange={e => setDraft({ ...draft, participation: Number(e.target.value) })} /></Field>
      <button className="button primary" type="submit">Guardar reglas</button>
    </form>
  );
}
