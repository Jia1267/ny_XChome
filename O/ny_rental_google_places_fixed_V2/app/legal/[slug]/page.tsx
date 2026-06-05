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
      </header>
      <section className="legalArticle">
        {page.sections.map(section => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
