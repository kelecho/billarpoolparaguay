const initials = (name: string) => name.split(' ').slice(0, 2).map(n => n[0]).join('');

export default function Avatar({ name, tone = 0 }: { name: string; tone?: number }) {
  return <span className={`avatar avatar-${tone % 4}`} aria-hidden="true">{initials(name)}</span>;
}
