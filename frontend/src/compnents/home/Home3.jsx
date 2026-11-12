import React from 'react';
import {
  BookOpenIcon,
  FaceSmileIcon,
  SparklesIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

// Each path matches a route in App.js (/:username/...). The AI chat is turned off,
// so it is not listed here.
const features = [
  {
    name: 'Personal journal',
    description: 'Write down your thoughts and experiences. Journals are private unless you choose to share them.',
    path: 'readjournals',
    action: 'Open your journal',
    icon: BookOpenIcon,
  },
  {
    name: 'Mood tracker',
    description: 'Record how you feel each day and look back at your entries over time.',
    path: 'mood',
    action: 'Track your mood',
    icon: FaceSmileIcon,
  },
  {
    name: 'Meditation',
    description: 'Time your meditation sessions and keep a simple record of your practice.',
    path: 'meditation',
    action: 'Start meditating',
    icon: SparklesIcon,
  },
  {
    name: 'Reflection questionnaire',
    description: 'Answer a few questions for personal reflection. It is not a screening tool and does not give a diagnosis.',
    path: 'quiz',
    action: 'Begin reflecting',
    icon: ClipboardDocumentListIcon,
  },
  {
    name: 'Anonymous sharing',
    description: 'Share thoughts and read posts from others without showing your name.',
    path: 'anonymoussharing',
    action: 'Visit anonymous sharing',
    icon: ChatBubbleLeftRightIcon,
  },
];

const MAX_TILT_DEG = 4;

// Tilts a card a few degrees towards a mouse pointer. CSS only applies the
// tilt for fine pointers that can hover and when reduced motion is not requested.
const handleTilt = (e) => {
  if (e.pointerType !== 'mouse') return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  e.currentTarget.style.setProperty('--ry', `${(x * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
  e.currentTarget.style.setProperty('--rx', `${(-y * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
};

const resetTilt = (e) => {
  e.currentTarget.style.removeProperty('--rx');
  e.currentTarget.style.removeProperty('--ry');
};

// tokenUser is only a display hint for choosing link targets, not proof of a session.
const Home3 = () => {
  const user = localStorage.getItem('tokenUser');

  return (
    <section aria-labelledby="home-features-title" className="relative isolate overflow-hidden py-16 sm:py-24">
      {/* Soft colour behind the glass so the blur has something to show. */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-wb-primary-soft blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-wb-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-wb-border/25 blur-3xl" />
      </div>

      <div className="wb-container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 id="home-features-title" className="wb-h2">
            Tools for your wellbeing
          </h2>
          <p className="mt-4 text-lg text-wb-muted">
            Simple, private tools to help you notice patterns and take small steps each day.
          </p>
          {!user && (
            <p className="mt-3 text-sm text-wb-muted">Sign in to use these tools.</p>
          )}
        </div>

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const href = user ? `/${encodeURIComponent(user)}/${feature.path}` : '/login';
            return (
              <li
                key={feature.name}
                className="wb-glass wb-tilt group flex flex-col rounded-wb-lg p-6 sm:p-7"
                onPointerMove={handleTilt}
                onPointerLeave={resetTilt}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-wb bg-gradient-to-br from-wb-primary-soft to-wb-surface shadow-wb-sm ring-1 ring-wb-border/50">
                  <feature.icon className="h-6 w-6 text-wb-primary" aria-hidden="true" />
                </div>
                <h3 className="wb-h3">{feature.name}</h3>
                <p className="mt-2 flex-1 leading-relaxed text-wb-muted">{feature.description}</p>
                <div className="mt-6 border-t border-wb-border/30 pt-4">
                  <a
                    href={href}
                    className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-wb-sm font-semibold text-wb-primary underline-offset-4 hover:underline"
                  >
                    {user ? feature.action : `Sign in to use ${feature.name.toLowerCase()}`}
                    <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default Home3;
