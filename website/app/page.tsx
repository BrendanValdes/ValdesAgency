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
  { label: "Ads", icon: Search },
  { label: "Website / calls", icon: Smartphone },
  { label: "Ava", icon: Bot },
  { label: "CRM", icon: Database },
  { label: "Follow-up", icon: MessageSquareText },
  { label: "Booked / won", icon: CalendarCheck },
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
              Turn urgent water problems into booked inspections
              <em> — and booked inspections into profitable jobs.</em>
            </h1>
            <p className={styles.heroBody}>
              Valdes Agency builds the acquisition, response, follow-up, and conversion system behind growing waterproofing companies.
            </p>
            <div className={styles.heroButtons}>
              <button className={styles.primaryButton} type="button" onClick={openBooking}>
                Book a growth call <ArrowRight size={17} aria-hidden="true" />
              </button>
              <a className={styles.secondaryButton} href="#video">
                See how it works <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <div className={styles.heroServiceLine} aria-label="Services included">
              <span>Demand</span>
              <i />
              <span>Response</span>
              <i />
              <span>Conversion</span>
              <i />
              <span>Follow-up</span>
            </div>
          </div>

          <div className={styles.heroDrawing} aria-label="A connected waterproofing growth system illustration">
            <div className={styles.drawingHeader}>
              <span>Growth architecture</span>
              <span>VA / WP-01</span>
            </div>
            <div className={styles.foundationDiagram}>
              <div className={styles.diagramLabel}>Homeowner demand</div>
              <div className={styles.rain} aria-hidden="true">
                <i /><i /><i /><i /><i /><i />
              </div>
              <div className={styles.house} aria-hidden="true">
                <span className={styles.roof} />
                <span className={styles.wall} />
                <span className={styles.basement} />
                <span className={styles.drainLine} />
                <span className={styles.sump} />
              </div>
              <div className={`${styles.flowCard} ${styles.flowCardOne}`}>
                <span>01</span>
                <strong>Problem identified</strong>
                <small>System responds</small>
              </div>
              <div className={`${styles.flowCard} ${styles.flowCardTwo}`}>
                <span>02</span>
                <strong>Inspection booked</strong>
                <small>Pipeline advances</small>
              </div>
              <div className={`${styles.flowCard} ${styles.flowCardThree}`}>
                <span>03</span>
                <strong>Estimate followed up</strong>
                <small>Opportunity protected</small>
              </div>
            </div>
            <div className={styles.drawingFooter}>
              <span><CircleDot size={12} /> Connected system</span>
              <span>Built for the next urgent call</span>
            </div>
          </div>
        </div>
        <div className={styles.heroRule} aria-hidden="true" />
      </section>

      <section className={`${styles.section} ${styles.videoSection}`} id="video">
        <div className={`${styles.shell} ${styles.videoGrid}`}>
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}><span /> 02 / The walkthrough</p>
            <h2 className={styles.displayTitle}>Two minutes.<br /><em>The whole growth engine.</em></h2>
            <p>
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
              <h2 className={styles.darkTitle}>Revenue leaks happen <em>between the steps.</em></h2>
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
            <h2 className={styles.darkTitle}>Be visible when the homeowner’s problem becomes <em>urgent.</em></h2>
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
            <h2 className={styles.darkTitle}>Turn expensive clicks into <em>inspection requests.</em></h2>
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
              <h2 className={styles.darkTitle}>The money isn’t only in generating the lead. <em>It’s in what happens next.</em></h2>
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
            <h2 className={styles.displayTitle}>One system.<br /><em>No dropped handoffs.</em></h2>
            <p>Each part makes the next part stronger — from the first search to the work you win.</p>
          </div>

          <ol className={styles.systemFlow}>
            {system.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></div>
                  <strong>{item.label}</strong>
                  {index < system.length - 1 && <ArrowRight className={styles.systemArrow} size={17} aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.processSection}`} id="process">
        <div className={styles.shell}>
          <div className={styles.processHeading}>
            <div>
              <p className={styles.darkEyebrow}>09 / Launch process</p>
              <h2 className={styles.darkTitle}>Built in sequence.<br /><em>Improved with evidence.</em></h2>
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
        <div className={`${styles.shell} ${styles.finalInner}`}>
          <p className={styles.eyebrow}><span /> Ready when you are</p>
          <h2 className={styles.finalTitle}>You handle the waterproofing. <em>We’ll build the system behind the growth.</em></h2>
          <p>Let’s look at where demand, response, and follow-up are breaking down — and what a connected system could change.</p>
          <button className={styles.primaryButton} type="button" onClick={openBooking}>
            Book a growth call <ArrowRight size={17} aria-hidden="true" />
          </button>
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
