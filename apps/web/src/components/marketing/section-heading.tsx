export function SectionHeading({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: React.ReactNode;
  aside?: string;
}) {
  return (
    <div className="section-heading" data-reveal>
      <p className="eyebrow">
        <span aria-hidden="true">✳</span>
        {eyebrow}
      </p>
      <div className="section-heading__row">
        <h2>{title}</h2>
        {aside && <p>{aside}</p>}
      </div>
    </div>
  );
}
