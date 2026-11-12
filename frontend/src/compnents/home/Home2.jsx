import React from 'react';
import { BookOpenIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

// Same eight topics and external information links as before.
const topics = [
  { name: 'ADHD', source: 'WHO', href: 'https://applications.emro.who.int/docs/EMRPUB_leaflet_2019_mnh_214_en.pdf' },
  { name: 'Depression', source: 'WHO', href: 'https://www.who.int/news-room/fact-sheets/detail/depression' },
  { name: 'Bipolar Disorder', source: 'WHO', href: 'https://applications.emro.who.int/docs/EMRPUB_leaflet_2019_mnh_216_en.pdf' },
  { name: 'PTSD', source: 'WHO', href: 'https://applications.emro.who.int/docs/WHOEMMNH235E-eng.pdf?ua=1' },
  { name: 'Schizophrenia', source: 'WHO', href: 'https://www.who.int/news-room/fact-sheets/detail/schizophrenia' },
  { name: 'Anxiety', source: 'WHO', href: 'https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders' },
  { name: 'Eating Disorder', source: 'NIMH', href: 'https://www.nimh.nih.gov/health/statistics/eating-disorders' },
  { name: 'Paranoia', source: 'NCBI', href: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6420131/' },
];

const Home2 = () => {
  return (
    <section
      aria-labelledby="home-topics-title"
      className="relative isolate overflow-hidden bg-gradient-to-b from-wb-bg via-wb-primary-soft/50 to-wb-primary-soft pb-16 sm:pb-24"
    >
      {/* Soft divider marking the move from the tools to reading material. */}
      <div className="mx-auto mb-12 h-px max-w-xs bg-gradient-to-r from-transparent via-wb-accent/60 to-transparent sm:mb-16" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 bottom-10 -z-10 h-72 w-72 rounded-full bg-wb-primary/10 blur-3xl" aria-hidden="true" />

      <div className="wb-container">
        <div className="wb-glass-soft rounded-[2rem] p-6 sm:p-10">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 id="home-topics-title" className="wb-h2">
              Mental Health
            </h2>
            <p className="mt-4 text-lg text-wb-muted">
              Read about some mental health related topics from external health organisations.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {topics.map((topic) => (
              <li key={topic.name}>
                <a
                  href={topic.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wb-glass wb-lift flex h-full items-start gap-3 rounded-wb p-4"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-wb-primary-soft ring-1 ring-wb-border/50">
                    <BookOpenIcon className="h-5 w-5 text-wb-primary" aria-hidden="true" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold text-wb-text">{topic.name}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-wb-primary">
                      Read More on {topic.source}
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">(opens an external site in a new tab)</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-center text-sm text-wb-muted">
            These links go to external websites. WellBridge is not responsible for their content.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Home2;
