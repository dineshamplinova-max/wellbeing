import React from 'react';
import Navbar from '../navbar/Navbar';

// General guidance only. Local contact details are not listed here until they
// have been checked against official sources.
const Support = () => {
  return (
    <div className="min-h-screen bg-wb-bg text-wb-text">
      <Navbar />
      <main className="wb-container max-w-3xl pb-16 pt-24">
        <h1 className="wb-h1">Support options</h1>
        <p className="mt-4 text-lg text-wb-muted">
          If things feel hard at the moment, you do not have to manage on your own. These are some
          ways to find support.
        </p>

        <section aria-labelledby="support-danger" className="wb-card wb-highlight mt-8">
          <h2 id="support-danger" className="wb-h3">If you are in immediate danger</h2>
          <p className="mt-2">
            Contact your local emergency services straight away, or go to the nearest hospital
            emergency department.
          </p>
        </section>

        <section aria-labelledby="support-talk" className="wb-card mt-6">
          <h2 id="support-talk" className="wb-h3">Talk to someone you trust</h2>
          <p className="mt-2 text-wb-muted">
            A friend, family member, colleague or teacher can listen and help you think about next steps.
          </p>
        </section>

        <section aria-labelledby="support-professional" className="wb-card mt-6">
          <h2 id="support-professional" className="wb-h3">Speak with a professional</h2>
          <p className="mt-2 text-wb-muted">
            A doctor or a licensed mental health professional can talk through how you have been
            feeling and what support might help.
          </p>
        </section>

        <section aria-labelledby="support-about" className="wb-card mt-6">
          <h2 id="support-about" className="wb-h3">About WellBridge</h2>
          <p className="mt-2 text-wb-muted">
            WellBridge is a self-care tool. It is not a crisis service, it is not monitored, and it
            cannot contact anyone on your behalf.
          </p>
        </section>

        <p className="mt-8">
          <a href="/" className="wb-link">Back to home</a>
        </p>
      </main>
    </div>
  );
};

export default Support;
