import React from 'react';
import Navbar from '../navbar/Navbar';
import { FaPen, FaEye, FaLock, FaHeart, FaComment, FaShieldAlt, FaArrowRight } from 'react-icons/fa';
import './AnonymousSharing.css';

const AnonymousSharing = () => {
  const user = localStorage.getItem('tokenUser');

  // The two main ways into the community. Routes are unchanged.
  const actions = [
    {
      id: 'create',
      href: `/${user}/createanonymouspost`,
      icon: <FaPen />,
      title: 'Create Post',
      description: 'Write about what is on your mind. Other members see it as "Anonymous member".',
      cta: 'Start writing',
      variant: 'primary'
    },
    {
      id: 'view',
      href: `/${user}/allanonymousposts`,
      icon: <FaEye />,
      title: 'View Posts',
      description: 'Read, search and respond to posts shared by other community members.',
      cta: 'Browse posts',
      variant: 'secondary'
    }
  ];

  const features = [
    {
      icon: <FaLock className="feature-icon" />,
      title: "Anonymous to Others",
      description: "Other members see your posts as \"Anonymous member\". We don't display your username or profile details."
    },
    {
      icon: <FaShieldAlt className="feature-icon" />,
      title: "Safe Space",
      description: "A supportive community where you can express yourself without judgment."
    },
    {
      icon: <FaHeart className="feature-icon" />,
      title: "Support & Connect",
      description: "Give and receive support through meaningful interactions with others."
    },
    {
      icon: <FaComment className="feature-icon" />,
      title: "Open Discussions",
      description: "Engage in honest conversations about mental health, experiences, and feelings."
    }
  ];

  const guidelines = [
    {
      title: "Be Respectful",
      description: "Treat others with kindness and empathy. Everyone's experience is valid."
    },
    {
      title: "Maintain Privacy",
      description: "Never share personal identifying information about yourself or others."
    },
    {
      title: "Support, Don't Judge",
      description: "Offer constructive support and avoid critical or harmful comments."
    },
    {
      title: "Look After Yourself",
      description: "Share at your own pace and take a break when you need one. If you are in immediate danger, contact your local emergency services."
    }
  ];

  return (
    <>
      <Navbar />
      <main className="anonymous-sharing-page">
        <section className="as-hero wb-hero-bg" aria-labelledby="as-hero-title">
          {/* Soft floating shapes for depth; decorative only. */}
          <div className="as-hero-shapes" aria-hidden="true">
            <span className="wb-float-shape wb-float-shape-blue as-shape-one" />
            <span className="wb-float-shape wb-float-shape-green as-shape-two" />
          </div>

          <div className="wb-container as-hero-inner">
            <p className="as-eyebrow wb-glass">
              <FaShieldAlt aria-hidden="true" />
              Anonymous community
            </p>
            <h1 id="as-hero-title" className="as-hero-title">
              Anonymous Sharing <span>Portal</span>
            </h1>
            <p className="as-hero-text">
              A safe haven for expressing yourself freely and connecting with others who understand.
            </p>

            <div className="as-actions">
              {actions.map((action) => (
                <a
                  key={action.id}
                  href={action.href}
                  className={`as-action-card as-action-card--${action.variant} wb-lift`}
                  aria-labelledby={`as-action-${action.id}-title`}
                  aria-describedby={`as-action-${action.id}-text`}
                >
                  <span className="as-action-icon" aria-hidden="true">{action.icon}</span>
                  <span className="as-action-body">
                    <span id={`as-action-${action.id}-title`} className="as-action-title">{action.title}</span>
                    <span id={`as-action-${action.id}-text`} className="as-action-text">{action.description}</span>
                    <span className="as-action-cta" aria-hidden="true">
                      {action.cta}
                      <FaArrowRight className="as-action-arrow" />
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="as-section wb-container" aria-labelledby="as-features-title">
          <h2 id="as-features-title" className="as-section-title">Why Share Anonymously?</h2>
          <div className="as-features-grid">
            {features.map((feature) => (
              <article key={feature.title} className="feature-card as-feature-card">
                <div className="as-feature-icon" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3 className="as-card-title">{feature.title}</h3>
                <p className="as-card-text">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="as-section as-section--last wb-container" aria-labelledby="as-guidelines-title">
          <div className="as-guidelines">
            <h2 id="as-guidelines-title" className="as-section-title">Community Guidelines</h2>
            {/* role="list" is intentional: Safari VoiceOver stops announcing a list once list-style is none. */}
            {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
            <ol className="as-guidelines-list" role="list">
              {guidelines.map((guideline) => (
                <li key={guideline.title} className="as-guideline">
                  <div>
                    <h3 className="as-card-title">{guideline.title}</h3>
                    <p className="as-card-text">{guideline.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </>
  );
};

export default AnonymousSharing;