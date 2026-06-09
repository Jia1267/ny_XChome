import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLegalPage, legalPages } from '@/lib/legal';

export function generateStaticParams() {
  return legalPages.map(page => ({ slug: page.slug }));
}

export default function LegalDetailPage({ params }: { params: { slug: string } }) {
  const page = getLegalPage(params.slug);
  if (!page) notFound();

  return (
    <main className="legalPage">
      <Link className="legalBack" href="/legal">Back to legal center</Link>
      <header>
        <p className="eyebrow">Compliance notice</p>
        <h1>{page.title}</h1>
        <p>{page.summary}</p>
        {page.effectiveDate && <p className="legalMeta">Effective date: {page.effectiveDate}</p>}
      </header>
      <p className="legalDisclaimer">
        This page is provided for general information only and is not legal advice. Final
        wording should be reviewed and approved by qualified counsel before relying on it.
      </p>
      <section className="legalArticle">
        {page.sections.map(section => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            {section.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul className="legalList">
                {section.bullets.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
