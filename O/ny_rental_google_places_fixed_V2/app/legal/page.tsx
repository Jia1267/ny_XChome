import Link from 'next/link';
import { legalPages } from '@/lib/legal';

export default function LegalIndexPage() {
  return (
    <main className="legalPage">
      <Link className="legalBack" href="/">Back to map</Link>
      <header>
        <p className="eyebrow">NY Rental Map</p>
        <h1>Legal and compliance center</h1>
        <p>Core notices for the student rental discovery trial. Final production wording should be reviewed by qualified counsel.</p>
      </header>
      <section className="legalGrid">
        {legalPages.map(page => (
          <Link key={page.slug} className="legalCard" href={`/legal/${page.slug}`}>
            <span>{page.title}</span>
            <p>{page.summary}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
