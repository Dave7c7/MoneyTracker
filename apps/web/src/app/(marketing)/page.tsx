import Link from 'next/link';

import { FeatureArtwork } from '@/components/marketing/artwork.tsx';
import { ContactForm } from '@/components/marketing/contact-form.tsx';
import { featureCards, processSteps } from '@/components/marketing/data.ts';
import { HeroVisual } from '@/components/marketing/hero-visual.tsx';
import { HorizontalGallery } from '@/components/marketing/horizontal-gallery.tsx';
import { ParallaxClarity } from '@/components/marketing/parallax-clarity.tsx';
import { ProcessIcon } from '@/components/marketing/process-icon.tsx';
import { ScrollReveals } from '@/components/marketing/scroll-reveals.tsx';
import { SectionHeading } from '@/components/marketing/section-heading.tsx';
import { SiteHeader } from '@/components/marketing/site-header.tsx';
import { TiltGrid } from '@/components/marketing/tilt-grid.tsx';

export default function LandingPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">
        <section id="top" className="hero" aria-labelledby="hero-title">
          <HeroVisual />
          <div className="hero__grid" aria-hidden="true" />
          <div className="hero__glow" aria-hidden="true" />

          <div className="hero__topline">
            <p>Self-hosted personal finance</p>
            <p>
              <span className="status-dot" aria-hidden="true" />
              Private by design · Everywhere you are
            </p>
          </div>

          <div className="hero__content">
            <p className="hero__kicker">Accounts · Insight · Control</p>
            <h1 id="hero-title" aria-label="Your money, in focus">
              <span className="hero__line" aria-hidden="true">
                <span>Your money, </span>
              </span>
              <span className="hero__line hero__line--indent" aria-hidden="true">
                <span>
                  in <em>focus.</em>
                </span>
              </span>
            </h1>
            <div className="hero__intro">
              <p>
                Bring every account, transaction and goal into one calm, explainable view. Built for
                people who want clarity without handing over their data.
              </p>
              <div className="hero__actions">
                <Link className="button button--primary" href="#features">
                  <span>Explore the features</span>
                  <span aria-hidden="true">↓</span>
                </Link>
                <Link className="text-link" href="/login">
                  Open the app <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="hero__foot">
            <span>MONEYTRACKER / 2026</span>
            <span className="hero__scroll-cue">
              <i aria-hidden="true" /> Scroll to enter
            </span>
            <span>PRIVATE BY DESIGN</span>
          </div>
        </section>

        <section id="about" className="about section-shell" aria-labelledby="about-title">
          <SectionHeading
            eyebrow="Clarity without compromise"
            title={
              <span id="about-title">
                Your money. <em>One clear picture.</em>
              </span>
            }
          />
          <div className="about__layout">
            <ParallaxClarity />
            <div className="about__copy" data-reveal>
              <p className="about__lead">
                MoneyTracker brings every account into one calm view — and shows you exactly{' '}
                <em>why each number looks the way it does.</em>
              </p>
              <div className="about__body">
                <p>
                  Built for people who want answers, not another wall of dashboards. Every category
                  assignment carries its source and reason, so automatic guesses are easy to inspect
                  and correct.
                </p>
                <p>
                  Import your own data, run it on your own machine, and keep the whole picture to
                  yourself. No bank passwords. No black-box insights. No mystery cloud.
                </p>
              </div>
              <ul className="about__services" aria-label="MoneyTracker capabilities">
                <li>
                  <span>01</span> Unified accounts
                </li>
                <li>
                  <span>02</span> Explainable categories
                </li>
                <li>
                  <span>03</span> Budgets & cash flow
                </li>
                <li>
                  <span>04</span> Self-hosted by default
                </li>
              </ul>
              <div className="about__stats">
                <div>
                  <strong>100%</strong>
                  <span>Assignments with a source</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Bank passwords stored</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>Private place for it all</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="work section-shell" aria-labelledby="features-title">
          <SectionHeading
            eyebrow="What it does / Built around clarity"
            title={
              <span id="features-title">
                Less searching. <em>More knowing.</em>
              </span>
            }
            aside="The everyday questions about money, answered in one place and in language you can follow."
          />
          <TiltGrid>
            {featureCards.map((feature, index) => (
              <article key={feature.title} className="feature-card" data-tilt data-reveal>
                <Link
                  className="feature-card__surface"
                  href="#gallery"
                  aria-label={`Explore ${feature.title} inside the app`}
                >
                  <div className="feature-card__art">
                    <FeatureArtwork variant={feature.variant} id={`feature-art-${index}`} />
                    <span className="feature-card__number" aria-hidden="true">
                      / 0{index + 1}
                    </span>
                    <span className="feature-card__view" aria-hidden="true">
                      See it in the app ↗
                    </span>
                  </div>
                  <div className="feature-card__content">
                    <div className="feature-card__meta">
                      <p>{feature.category}</p>
                      <p>{feature.tag}</p>
                    </div>
                    <h3>{feature.title}</h3>
                    <p className="feature-card__description">{feature.description}</p>
                  </div>
                </Link>
              </article>
            ))}
          </TiltGrid>
        </section>

        <HorizontalGallery />

        <section id="process" className="process section-shell" aria-labelledby="process-title">
          <SectionHeading
            eyebrow="How it works"
            title={
              <span id="process-title">
                From statements <em>to signal.</em>
              </span>
            }
            aside="A short path from scattered accounts to numbers you can question, correct and trust."
          />
          <ol className="process-timeline">
            {processSteps.map((step) => (
              <li key={step.number} data-reveal>
                <div className="process-timeline__marker" aria-hidden="true">
                  <span />
                </div>
                <div className="process-timeline__top">
                  <ProcessIcon type={step.icon} />
                  <span>{step.number}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
          <div className="process__note" data-reveal>
            <span aria-hidden="true">✳</span>
            <p>Rules get smarter because you stay in charge.</p>
          </div>
        </section>

        <section id="contact" className="contact section-shell" aria-labelledby="contact-title">
          <div className="contact__heading" data-reveal>
            <p className="eyebrow">
              <span aria-hidden="true">✳</span> Self-hosted. Single user. Yours.
            </p>
            <h2 id="contact-title">
              Ready to take
              <br />
              <em>the controls?</em>
            </h2>
          </div>
          <div className="contact__layout">
            <div className="contact__aside" data-reveal>
              <p>
                Questions about setting up your own tracker, importing data or running it at home?
                Send a note, or open the app and start with your first account.
              </p>
              <a href="https://github.com/Dave7c7/MoneyTracker" className="contact__email">
                github.com/Dave7c7/MoneyTracker <span aria-hidden="true">↗</span>
              </a>
              <div className="contact__availability">
                <span className="status-dot" aria-hidden="true" />
                <p>
                  Built to run
                  <br />
                  <strong>on your own hardware</strong>
                </p>
              </div>
            </div>
            <div data-reveal>
              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer__top">
          <Link className="wordmark" href="#top" aria-label="MoneyTracker, back to top">
            <span className="wordmark__mark" aria-hidden="true">
              M<span>↗</span>
            </span>
            <span>MONEYTRACKER</span>
          </Link>
          <p>
            Self-hosted personal finance.
            <br />
            Clarity without compromise.
          </p>
          <Link className="back-to-top" href="#top">
            Back to the top <span aria-hidden="true">↑</span>
          </Link>
        </div>
        <div className="site-footer__bottom">
          <span>© 2026 MoneyTracker.</span>
          <span>Your data stays yours.</span>
        </div>
      </footer>
      <ScrollReveals />
    </>
  );
}
