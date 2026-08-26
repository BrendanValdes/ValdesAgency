"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Droplets,
  FileText,
  Gauge,
  MapPin,
  MessageSquareText,
  MousePointerClick,
  Phone,
  PhoneCall,
  Play,
  Search,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useBooking } from "@/components/BookingProvider";
import { CONTACT, VIDEO_EMBED_URL } from "@/lib/copy";
import styles from "./page.module.css";

const journey = [
  { label: "Problem", detail: "Water shows up", icon: Droplets },
  { label: "Search / call", detail: "Help is urgent", icon: Search },
  { label: "Inspection", detail: "A visit gets booked", icon: CalendarCheck },
  { label: "Estimate", detail: "Scope and price", icon: FileText },
  { label: "Follow-up", detail: "Questions get answered", icon: MessageSquareText },
  { label: "Won job", detail: "Work gets scheduled", icon: Check },
] as const;

const demandServices = [
  "Basement waterproofing",
  "Crawl-space moisture & encapsulation",
  "Drainage & sump systems",
  "Foundation-related work",
] as const;

const pipeline = ["New lead", "Contacted", "Inspection", "Estimate", "Follow-up", "Won"] as const;

const system = [
  { label: "Demand", detail: "Local intent", icon: Search },
  { label: "Website / calls", detail: "Clear response", icon: Smartphone },
  { label: "Ava", detail: "Answers now", icon: Bot },
  { label: "CRM", detail: "One record", icon: Database },
  { label: "Follow-up", detail: "Next action", icon: MessageSquareText },
  { label: "Won work", detail: "Revenue protected", icon: CalendarCheck },
] as const;

const launch = [
  { number: "01", title: "Diagnose", copy: "Find the gaps between demand, response, and sold work." },
  { number: "02", title: "Build", copy: "Create the pages, campaigns, call handling, and pipeline." },
  { number: "03", title: "Launch", copy: "Connect the system and put it in front of local homeowners." },
  { number: "04", title: "Improve", copy: "Use real lead quality and sales feedback to sharpen it." },
] as const;

export default function Home() {
  const { open: openBooking } = useBooking();
  const [playing, setPlaying] = useState(false);
  const videoUrl: string = VIDEO_EMBED_URL;

  return (
    <main className={styles.site}>
      <section className={`${styles.section} ${styles.hero}`} id="top">
        <div className={styles.blueprintGrid} aria-hidden="true" />
        <header className={`${styles.shell} ${styles.header}`}>
          <a className={styles.brand} href="#top" aria-label="Valdes Agency home">
            <span className={styles.monogram}>VA</span>
            <span className={styles.brandName}>Valdes Agency</span>
          </a>
          <div className={styles.headerActions}>
            <a className={styles.phoneLink} href={`tel:${CONTACT.phoneHref}`}>
              <Phone size={15} aria-hidden="true" />
              <span>{CONTACT.phone}</span>
            </a>
            <button className={styles.headerCta} type="button" onClick={openBooking}>
              Book a growth call
            </button>
          </div>
        </header>

        <div className={`${styles.shell} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span /> Growth systems for waterproofing companies
            </p>
            <h1 className={styles.heroTitle}>
              Turn urgent water problems into booked, profitable work.
            </h1>
            <p className={styles.heroBody}>
              Create more qualified opportunities, book more inspections, and keep every estimate moving toward won work.
            </p>
            <div className={styles.heroButtons}>
              <button className={styles.primaryButton} type="button" onClick={openBooking}>
                Book a growth call <ArrowRight size={17} aria-hidden="true" />
              </button>
              <a className={styles.secondaryButton} href="#video">
                See how it works <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className={styles.heroDrawing} aria-label="Homeowner demand becoming a booked inspection, an active estimate, and won waterproofing work">
            <div className={styles.heroAtmosphere} aria-hidden="true" />
            <svg className={styles.heroContours} viewBox="0 0 640 660" aria-hidden="true">
              <path d="M40 410C82 292 172 220 292 214c126-7 225 48 308 164" />
              <path d="M18 455c48-145 153-234 287-238 142-5 250 64 326 198" />
              <path d="M-6 501c54-174 178-278 325-277 157 2 270 84 338 234" />
              <path d="M86 378c37-84 108-136 203-143 102-7 186 32 261 126" />
              <path d="M137 349c30-58 84-94 154-99 78-5 145 25 201 91" />
            </svg>
            <div className={styles.heroSignalStage}>
              <svg className={styles.heroBeamMap} viewBox="0 0 600 520" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="heroBeamBlue" x1="0" x2="1">
                    <stop offset="0" stopColor="#7eb7ec" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#7eb7ec" />
                    <stop offset="1" stopColor="#2879df" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="heroBeamCopper" x1="0" x2="1">
                    <stop offset="0" stopColor="#c46f43" stopOpacity="0" />
                    <stop offset="0.55" stopColor="#e19a71" />
                    <stop offset="1" stopColor="#c46f43" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="heroBeamSuccess" x1="0" x2="1">
                    <stop offset="0" stopColor="#7ba58a" stopOpacity="0" />
                    <stop offset="0.58" stopColor="#91b59d" />
                    <stop offset="1" stopColor="#7ba58a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className={styles.heroBeamBase} d="M104 116C175 116 188 222 292 244S365 113 465 113" />
                <path className={styles.heroBeamBase} d="M465 113C480 214 382 280 267 354S371 437 490 432" />
                <path className={`${styles.heroBeamPulse} ${styles.heroBeamBlue}`} pathLength="1" d="M104 116C175 116 188 222 292 244S365 113 465 113" />
                <path className={`${styles.heroBeamPulse} ${styles.heroBeamCopper}`} pathLength="1" d="M465 113C480 214 382 280 267 354" />
                <path className={`${styles.heroBeamPulse} ${styles.heroBeamSuccess}`} pathLength="1" d="M267 354C283 430 371 437 490 432" />
              </svg>

              <div className={`${styles.heroSignalCard} ${styles.heroDemandCard}`}>
                <span><Search size={15} aria-hidden="true" /> Homeowner intent</span>
                <strong>“Basement water near me”</strong>
              </div>

              <div className={`${styles.heroSignalCard} ${styles.heroInspectionCard}`}>
                <span><CalendarCheck size={15} aria-hidden="true" /> Inspection booked</span>
                <strong>Tuesday · 10:30 AM</strong>
              </div>

              <div className={styles.heroOutcomeMessage}>
                <small>Pipeline momentum</small>
                <strong>More opportunities<br />moving forward.</strong>
              </div>

              <div className={`${styles.heroSignalCard} ${styles.heroEstimateCard}`}>
                <span><MessageSquareText size={15} aria-hidden="true" /> Estimate follow-up</span>
                <strong>Opportunity active</strong>
                <small><i /> Next touch scheduled</small>
              </div>

              <div className={`${styles.heroSignalCard} ${styles.heroWonCard}`}>
                <span><Check size={16} aria-hidden="true" /> Job won</span>
                <strong>Work scheduled</strong>
                <small>New revenue secured</small>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.heroRule} aria-hidden="true" />
      </section>

      <section className={`${styles.section} ${styles.videoSection}`} id="video">
        <div className={`${styles.shell} ${styles.videoGrid}`}>
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}><span /> 02 / The walkthrough</p>
            <h2 className={`${styles.displayTitle} ${styles.walkthroughTitle}`}>
              <span>Two minutes.</span>
              <span>The whole growth engine.</span>
            </h2>
            <p className={styles.walkthroughCopy}>
              See how search, calls, booking, estimates, and follow-up work as one revenue system rather than separate marketing tasks.
            </p>
            <div className={styles.videoIndex}>
              <span>Watch</span>
              <strong>02:00</strong>
            </div>
          </div>

          <div className={styles.videoFrame}>
            <div className={styles.videoTopline}>
              <span>Valdes Agency / Field Briefing</span>
              <span>Play film</span>
            </div>
            <div className={styles.videoViewport}>
              {playing && videoUrl ? (
                <iframe
                  src={videoUrl}
                  title="The Valdes waterproofing growth engine walkthrough"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button
                  type="button"
                  className={styles.playButton}
                  onClick={() => setPlaying(true)}
                  aria-label="Play the growth engine walkthrough"
                >
                  <span><Play size={24} fill="currentColor" aria-hidden="true" /></span>
                  <strong>See the system in motion</strong>
                  <small>Acquisition to won work</small>
                </button>
              )}
              <div className={styles.videoContour} aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.journeySection}`} id="journey">
        <div className={styles.sectionNumber} aria-hidden="true">03</div>
        <div className={styles.shell}>
          <div className={styles.splitHeading}>
            <div>
              <p className={styles.darkEyebrow}>Waterproofing customer journey</p>
              <h2 className={styles.darkTitle}>Revenue leaks happen between the steps.</h2>
            </div>
            <p>
              A homeowner rarely gives you unlimited time. Every handoff has to keep urgency, trust, and momentum intact.
            </p>
          </div>

          <ol className={styles.journeyRail}>
            {journey.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.label}>
                  <div className={styles.journeyNode}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <Icon size={21} strokeWidth={1.6} aria-hidden="true" />
                  </div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                  {index < journey.length - 1 && <ChevronRight className={styles.railArrow} size={18} aria-hidden="true" />}
                </li>
              );
            })}
          </ol>

          <div className={styles.leakGrid}>
            <article>
              <span>Leak 01</span>
              <h3>Missed calls</h3>
              <p>The next contractor is one tap away when nobody answers.</p>
            </article>
            <article>
              <span>Leak 02</span>
              <h3>Slow response</h3>
              <p>Urgency cools while the homeowner keeps searching.</p>
            </article>
            <article>
              <span>Leak 03</span>
              <h3>Inconsistent demand</h3>
              <p>The calendar swings between overloaded and quiet.</p>
            </article>
            <article>
              <span>Leak 04</span>
              <h3>Weak estimate follow-up</h3>
              <p>Good opportunities stall after the inspection.</p>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.demandSection}`} id="demand">
        <div className={`${styles.shell} ${styles.demandGrid}`}>
          <div className={styles.demandCopy}>
            <p className={styles.darkEyebrow}>04 / Demand generation</p>
            <h2 className={styles.darkTitle}>Be visible when the homeowner’s problem becomes urgent.</h2>
            <p>
              Google captures active intent. Meta builds local familiarity before and after the search. Both point toward a clear inspection request.
            </p>
            <div className={styles.channelPair}>
              <div><span>G</span><strong>Google</strong><small>Capture demand</small></div>
              <div><span>M</span><strong>Meta</strong><small>Create familiarity</small></div>
            </div>
          </div>

          <div className={styles.searchBoard}>
            <div className={styles.searchBar}>
              <Search size={17} aria-hidden="true" />
              <span>waterproofing company near me</span>
              <kbd>Search</kbd>
            </div>
            <p className={styles.boardLabel}>High-intent service demand</p>
            <div className={styles.serviceStack}>
              {demandServices.map((service, index) => (
                <div key={service}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{service}</strong>
                  <ArrowRight size={16} aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className={styles.mapStrip}>
              <MapPin size={16} aria-hidden="true" />
              <span>Built around the service area you actually cover</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.avaSection}`} id="ava">
        <div className={styles.avaHalo} aria-hidden="true" />
        <div className={`${styles.shell} ${styles.avaHeading}`}>
          <p className={styles.eyebrow}><span /> 05 / Ava, AI receptionist</p>
          <h2 className={styles.displayTitle}>When the phone rings, a homeowner needs help. <em>Someone should answer.</em></h2>
        </div>

        <div className={`${styles.shell} ${styles.avaConsole}`}>
          <svg className={styles.avaBeamMap} viewBox="0 0 1200 430" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="avaBeamGradient" x1="0" x2="1">
                <stop offset="0" stopColor="#7eb7ec" stopOpacity="0" />
                <stop offset="0.48" stopColor="#7eb7ec" />
                <stop offset="0.72" stopColor="#e19a71" />
                <stop offset="1" stopColor="#e19a71" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className={styles.avaBeamBase} d="M180 210C340 210 370 120 600 120S860 210 1020 210" />
            <path className={styles.avaBeamPulse} pathLength="1" d="M180 210C340 210 370 120 600 120S860 210 1020 210" />
          </svg>
          <div className={styles.incomingCall}>
            <div className={styles.callStatus}><span /> Incoming call</div>
            <div className={styles.callerAvatar}><PhoneCall size={28} aria-hidden="true" /></div>
            <p>Homeowner</p>
            <strong>Basement water issue</strong>
            <small><Clock3 size={13} /> Needs a fast response</small>
          </div>

          <div className={styles.avaConnector} aria-hidden="true">
            <span />
            <i>answered</i>
          </div>

          <div className={styles.avaCore}>
            <div className={styles.avaMark}>A</div>
            <p>Ava</p>
            <strong>Answers · Qualifies · Books</strong>
            <div className={styles.waveform} aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <blockquote>“I can help with that. Let’s find a time for an inspection.”</blockquote>
          </div>

          <div className={styles.avaConnector} aria-hidden="true">
            <span />
            <i>qualified</i>
          </div>

          <div className={styles.bookedCard}>
            <span><CalendarCheck size={17} /> Inspection booked</span>
            <strong>New opportunity</strong>
            <div><small>Service</small><p>Waterproofing inspection</p></div>
            <div><small>Status</small><p>Added to CRM</p></div>
            <div className={styles.confirmed}><Check size={14} /> Confirmation sent</div>
          </div>
        </div>

        <div className={`${styles.shell} ${styles.avaRoute}`} aria-label="Ava lead routing">
          <span>Incoming lead</span><ArrowRight size={15} /><span>Ava</span><ArrowRight size={15} /><span>Qualified</span><ArrowRight size={15} /><span>Inspection booked</span><ArrowRight size={15} /><span>CRM</span>
        </div>
      </section>

      <section className={`${styles.section} ${styles.websiteSection}`} id="website">
        <div className={`${styles.shell} ${styles.websiteGrid}`}>
          <div className={styles.browserMockup}>
            <div className={styles.browserBar}>
              <i /><i /><i />
              <span>yourwaterproofingcompany.com</span>
            </div>
            <div className={styles.mockSite}>
              <nav><strong>YOUR WATERPROOFING CO.</strong><span>Services &nbsp; Service Area &nbsp; About</span><b>Request inspection</b></nav>
              <div className={styles.mockHero}>
                <p>Local waterproofing specialists</p>
                <h3>A dry, protected home starts here.</h3>
                <span>Request an inspection <ArrowRight size={12} /></span>
              </div>
              <div className={styles.trustRow}>
                <span><ShieldCheck size={15} /> Credentials</span>
                <span><MapPin size={15} /> Local relevance</span>
                <span><Phone size={15} /> Clear contact</span>
              </div>
            </div>
          </div>

          <div className={styles.websiteCopy}>
            <p className={styles.darkEyebrow}>06 / Conversion website</p>
            <h2 className={styles.darkTitle}>Turn expensive clicks into inspection requests.</h2>
            <p>
              The site makes the next step obvious, builds confidence quickly, and works just as hard on a wet basement at 9 p.m. as it does on desktop.
            </p>
            <ul>
              <li><ShieldCheck size={18} /><span><strong>Trust</strong>Credentials, proof, and a clear process</span></li>
              <li><MapPin size={18} /><span><strong>Local relevance</strong>Services and areas homeowners recognize</span></li>
              <li><Gauge size={18} /><span><strong>Mobile performance</strong>Fast, readable, and easy to act on</span></li>
              <li><MousePointerClick size={18} /><span><strong>Low friction</strong>Clear paths to call or request an inspection</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.crmSection}`} id="follow-up">
        <div className={styles.shell}>
          <div className={styles.splitHeading}>
            <div>
              <p className={styles.darkEyebrow}>07 / Follow-up + CRM</p>
              <h2 className={styles.darkTitle}>The money isn’t only in generating the lead. It’s in what happens next.</h2>
            </div>
            <p>
              Every conversation has a place, every opportunity has a next action, and every estimate can be followed until the homeowner decides.
            </p>
          </div>

          <div className={styles.pipelineBoard}>
            <div className={styles.pipelineHeader}>
              <span>Waterproofing opportunity pipeline</span>
              <span><CircleDot size={11} /> Live workflow</span>
            </div>
            <ol className={styles.pipelineStages}>
              {pipeline.map((stage, index) => (
                <li key={stage} className={index === 5 ? styles.wonStage : undefined}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage}</strong>
                  <div><i /></div>
                </li>
              ))}
            </ol>
            <div className={styles.pipelineNotes}>
              <span><MessageSquareText size={15} /> Automatic reminders support the handoff</span>
              <span><Database size={15} /> Calls, forms, and estimates stay connected</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.systemSection}`} id="system">
        <div className={styles.systemLines} aria-hidden="true" />
        <div className={styles.shell}>
          <div className={styles.systemHeading}>
            <p className={styles.eyebrow}><span /> 08 / Connected growth system</p>
            <h2 className={styles.displayTitle}>One system. No dropped handoffs.</h2>
            <p>Each part makes the next part stronger — from the first search to the work you win.</p>
          </div>

          <div className={styles.systemCanvas}>
            <div className={styles.systemGlow} aria-hidden="true" />
            <svg className={styles.systemBeamMap} viewBox="0 0 1200 380" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="systemBeamGradient" x1="0" x2="1">
                  <stop offset="0" stopColor="#7eb7ec" stopOpacity="0" />
                  <stop offset="0.08" stopColor="#7eb7ec" />
                  <stop offset="0.19" stopColor="#2879df" />
                  <stop offset="0.27" stopColor="#e19a71" />
                  <stop offset="0.78" stopColor="#c46f43" />
                  <stop offset="0.88" stopColor="#91b59d" />
                  <stop offset="1" stopColor="#7ba58a" stopOpacity="0.32" />
                </linearGradient>
              </defs>
              <path className={styles.systemBeamBase} d="M95 236C170 236 186 106 292 106S390 237 500 237s111-131 206-131 111 131 207 131 111-131 194-131" />
              <path className={styles.systemBeamPulse} pathLength="1" d="M95 236C170 236 186 106 292 106S390 237 500 237s111-131 206-131 111 131 207 131 111-131 194-131" />
            </svg>
            <ol className={styles.systemFlow}>
              {system.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></div>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.processSection}`} id="process">
        <div className={styles.shell}>
          <div className={styles.processHeading}>
            <div>
              <p className={styles.darkEyebrow}>09 / Launch process</p>
              <h2 className={styles.darkTitle}>Built in sequence. Improved with evidence.</h2>
            </div>
            <p>A focused progression from the current state to a working, connected acquisition and conversion system.</p>
          </div>
          <ol className={styles.processGrid}>
            {launch.map((phase) => (
              <li key={phase.number}>
                <span>{phase.number}</span>
                <div>
                  <h3>{phase.title}</h3>
                  <p>{phase.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.finalSection}`} id="book">
        <div className={styles.finalContour} aria-hidden="true" />
        <div className={`${styles.shell} ${styles.finalStage}`}>
          <div className={styles.finalOrb} aria-hidden="true" />
          <div className={styles.finalInner}>
            <p className={styles.eyebrow}><span /> Ready when you are</p>
            <h2 className={styles.finalTitle}>You handle the waterproofing. <em>We’ll build the system behind the growth.</em></h2>
            <p>Let’s look at where demand, response, and follow-up are breaking down — and what a connected system could change.</p>
            <button className={styles.primaryButton} type="button" onClick={openBooking}>
              Book a growth call <ArrowRight size={17} aria-hidden="true" />
            </button>
            <div className={styles.finalRoute} aria-label="The connected growth system">
              <span>Demand</span><i /><span>Response</span><i /><span>Follow-up</span><i /><span>Won work</span>
            </div>
          </div>
        </div>

        <div className={`${styles.shell} ${styles.footerSignature}`} aria-hidden="true">
          <span>VALDES</span><small>AGENCY</small>
        </div>

        <footer className={`${styles.shell} ${styles.footer}`}>
          <a className={styles.brand} href="#top" aria-label="Back to top">
            <span className={styles.monogram}>VA</span>
            <span className={styles.brandName}>Valdes Agency</span>
          </a>
          <p>Growth systems for waterproofing companies.</p>
          <div>
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            <a href={`tel:${CONTACT.phoneHref}`}>{CONTACT.phone}</a>
          </div>
          <span>© 2026 Valdes Agency</span>
        </footer>
      </section>
    </main>
  );
}
