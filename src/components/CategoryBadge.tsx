import type { Rules } from '../domain';

const emblems = ['primera', 'segunda', 'tercera', 'principiante'];

export default function CategoryBadge({ category, rules, large = false, iconOnly = false }: {
  category: string; rules: Rules; large?: boolean; iconOnly?: boolean;
}) {
  const tier = [...rules.categories].sort((a, b) => b.min - a.min).findIndex(c => c.name === category);
  const emblem = emblems[tier] ?? 'principiante';
  if (iconOnly) return <img className="category-icon" src={`/badges/${emblem}.svg`} alt="" aria-hidden="true" />;
  return (
    <span className={`category-badge category-badge-${tier}${large ? ' category-badge-large' : ''}`}>
      <img className="category-icon" src={`/badges/${emblem}.svg`} alt={`Insignia de ${category}`} />
      <span>{large && <small>Categoría</small>}<span>{category}</span></span>
    </span>
  );
}
