import React from 'react';
import { InformationCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';

// Moves the decorative glass panels slightly with a mouse pointer.
// CSS ignores --px/--py when reduced motion is requested.
const handleParallax = (e) => {
  if (e.pointerType !== 'mouse') return;
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--px', ((e.clientX - rect.left) / rect.width - 0.5).toFixed(3));
  e.currentTarget.style.setProperty('--py', ((e.clientY - rect.top) / rect.height - 0.5).toFixed(3));
};

const resetParallax = (e) => {
  e.currentTarget.style.removeProperty('--px');
  e.currentTarget.style.removeProperty('--py');
};

// tokenUser is only a display hint for choosing which links to show.
// It is not proof of a session: the API checks the session cookie on every request.
const Home1 = () => {
  const user = localStorage.getItem('tokenUser');
  const userPath = user ? `/${encodeURIComponent(user)}` : null;

  return (
    <section
      aria-labelledby="home-hero-title"
      className="wb-hero-bg relative isolate overflow-hidden border-b border-wb-border/40 py-16 sm:py-20 lg:py-24"
      onPointerMove={handleParallax}
      onPointerLeave={resetParallax}
    >
      {/* Soft floating shapes for depth; decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <span className="wb-float-shape wb-float-shape-blue -left-16 top-10 h-48 w-48" />
        <span className="wb-float-shape wb-float-shape-green bottom-8 left-1/3 h-32 w-32" />
      </div>
      <div className="wb-container">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="text-center lg:text-left">
            <p className="wb-glass mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-wb-muted">
              <span className="h-2 w-2 rounded-full bg-wb-primary" aria-hidden="true" />
              Your everyday wellbeing space
            </p>

            <h1 id="home-hero-title" className="wb-h1">
              Welcome to <span className="text-wb-primary">WellBridge</span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-wb-muted lg:mx-0">
              A calm place to write in a private journal, check in with your mood, keep track of
              meditation, and reflect on how you have been feeling, at your own pace.
            </p>

            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
              {userPath ? (
                <>
                  <a href={`${userPath}/createjournal`} className="wb-btn wb-btn-primary shadow-wb">
                    Write in your journal
                  </a>
                  <a href={`${userPath}/mood`} className="wb-btn wb-btn-secondary">
                    Check in with your mood
                  </a>
                </>
              ) : (
                <>
                  <a href="/signup" className="wb-btn wb-btn-primary shadow-wb">
                    Get started
                  </a>
                  <a href="/login" className="wb-btn wb-btn-secondary">
                    Sign in
                  </a>
                </>
              )}
              <a href="/aboutus" className="wb-btn text-wb-primary hover:bg-wb-primary/15">
                Learn more
              </a>
            </div>
          </div>

          {/* Decorative glass composition: no text, hidden from assistive technology. */}
          <div className="relative mx-auto h-56 w-full max-w-md sm:h-72 lg:h-96" aria-hidden="true">
            <div className="absolute right-6 top-6 h-40 w-40 rounded-full bg-wb-primary/25 blur-3xl sm:h-56 sm:w-56" />
            <div className="absolute bottom-4 left-4 h-32 w-32 rounded-full bg-wb-border/50 blur-3xl sm:h-44 sm:w-44" />

            <div className="wb-parallax wb-glass-soft absolute inset-x-6 bottom-10 top-4 rounded-[2rem]" style={{ '--depth': '8px' }} />

            <div className="wb-parallax wb-glass absolute bottom-0 left-0 w-3/5 rounded-wb-lg p-4 sm:p-5" style={{ '--depth': '18px' }}>
              <div className="mb-3 h-8 w-8 rounded-full bg-wb-primary/80" />
              <div className="mb-2 h-2 w-4/5 rounded-full bg-wb-border/60" />
              <div className="mb-2 h-2 w-3/5 rounded-full bg-wb-border/45" />
              <div className="h-2 w-2/5 rounded-full bg-wb-border/35" />
            </div>

            <div className="wb-parallax wb-glass absolute right-0 top-0 flex h-20 w-20 items-center justify-center rounded-wb-lg sm:h-24 sm:w-24" style={{ '--depth': '26px' }}>
              <SparklesIcon className="h-8 w-8 text-wb-primary" />
            </div>
          </div>
        </div>

        <div className="wb-glass mx-auto mt-12 flex max-w-3xl items-start gap-3 rounded-wb p-4 text-left text-sm text-wb-muted">
          <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-wb-primary" aria-hidden="true" />
          <p>
            <span className="font-semibold text-wb-text">Please note: </span>
            WellBridge is a self-care tool. It is not a substitute for a doctor or another qualified
            health professional, and it cannot provide crisis support. If you are in immediate danger,
            contact your local emergency services.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Home1;
