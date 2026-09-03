"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, CalendarCheck, Check, ChevronRight, Clock3, FileCheck2, FileText, MapPin, Menu, MessageSquareText, PhoneCall, Play, RotateCcw, Search, ShieldCheck, Sparkles, UserRoundCheck, X, Zap } from "lucide-react";
import { useBooking } from "@/components/BookingProvider";
import { CONTACT, VIDEO_EMBED_URL } from "@/lib/copy";
import styles from "./page.module.css";

const situations = [
  { number: "01", title: "More opportunities", copy: "Qualified demand is the next constraint on growth.", link: "#demand" },
  { number: "02", title: "Faster response", copy: "Interest is coming in. You want more of it contacted and booked quickly.", link: "#response" },
  { number: "03", title: "More from what you have", copy: "Leads, estimates, or past opportunities are not being worked consistently.", link: "#outbound" },
  { number: "04", title: "Faster quoting", copy: "Quoting pressure is growing, or too much depends on one person.", link: "#quoting" },
] as const;
const journey = [
  { label: "Inquiry", detail: "Interest arrives", icon: Search }, { label: "Contact", detail: "A conversation starts", icon: PhoneCall },
  { label: "Inspection", detail: "A visit is booked", icon: CalendarCheck }, { label: "Quote", detail: "The next decision is clear", icon: FileText },
  { label: "Follow-up", detail: "Momentum continues", icon: MessageSquareText }, { label: "Won work", detail: "The job moves ahead", icon: Check },
] as const;
const outboundGroups = ["Open estimate", "Old lead", "No-show", "Past opportunity"] as const;
const quoteInputs = ["Your labor", "Your materials", "Your margins", "Your pricing rules"] as const;
const connected = ["Demand", "Contact", "Inspection", "Quote", "Follow-up", "Won work"] as const;
const launch = [
  { number: "01", title: "Understand", copy: "Map how opportunities currently move through your business." },
  { number: "02", title: "Choose", copy: "Identify the one part where added capacity would matter most." },
  { number: "03", title: "Build", copy: "Create a system around your team, process, and existing tools." },
  { number: "04", title: "Improve", copy: "Refine it with real conversations and operating feedback." },
] as const;

export default function Home() {
  const { open: openBooking } = useBooking();
  const [playing, setPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const videoUrl: string = VIDEO_EMBED_URL;

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <main className={styles.site}>
      <section className={`${styles.section} ${styles.hero}`} id="top">
        <video className={styles.heroVideo} autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4" type="video/mp4" />
        </video>
        <div className={styles.heroVeil} aria-hidden="true" />
        <header className={`${styles.shell} ${styles.header}`}>
          <a className={styles.brand} href="#top" aria-label="Valdes Agency home"><span className={styles.monogram}><img className={styles.logoImage} src="/images/valdes-agency-mark.png" alt="" /></span><span className={styles.brandName}>Valdes Agency</span></a>
          <nav className={styles.desktopNav} aria-label="Primary navigation"><a href="#video">How it works</a><a href="#system">Systems</a><a href="#quoting">Quoting</a><a href="#book">Contact</a></nav>
          <button className={styles.headerCta} type="button" onClick={openBooking}>Book a call</button>
          <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
        </header>
        <div className={`${styles.shell} ${styles.heroStage}`}>
          <div className={styles.heroCopy}>
            <p className={styles.heroIdentity}><span><Zap size={13} aria-hidden="true" /></span> AI revenue systems for waterproofing companies</p>
            <h1 className={styles.heroTitle}><span>Turn more inquiries</span><span>into quoted, won work.</span></h1>
            <p className={styles.heroBody}>Valdes Agency builds AI systems that respond instantly, answer calls, follow up, <span className={styles.nowrap}>re-engage</span> opportunities, and help your team quote faster.</p>
            <div className={styles.heroButtons}><button className={styles.primaryButton} type="button" onClick={openBooking}>See where AI fits <ArrowRight size={17} aria-hidden="true" /></button><a className={styles.heroTextLink} href="#video">See how it works <ArrowDown size={15} aria-hidden="true" /></a></div>
          </div>
        </div>
        <div className={`${styles.shell} ${styles.heroOutcomes}`} aria-label="Revenue system outcomes"><div><Zap size={16} aria-hidden="true" /><span>Instant response</span></div><div><CalendarCheck size={16} aria-hidden="true" /><span>Booked inspections</span></div><div><FileCheck2 size={16} aria-hidden="true" /><span>Faster quotes</span></div><div className={styles.successOutcome}><Check size={16} aria-hidden="true" /><span>Won work</span></div></div>
        <div className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`} id="mobile-navigation" aria-hidden={!menuOpen} onClick={() => setMenuOpen(false)}><nav aria-label="Mobile navigation" onClick={(event) => event.stopPropagation()}><a href="#video" onClick={() => setMenuOpen(false)}>How it works</a><a href="#system" onClick={() => setMenuOpen(false)}>Systems</a><a href="#quoting" onClick={() => setMenuOpen(false)}>Quoting</a><a href="#book" onClick={() => setMenuOpen(false)}>Contact</a><button type="button" onClick={() => { setMenuOpen(false); openBooking(); }}>Book a call <ArrowRight size={18} aria-hidden="true" /></button></nav></div>
      </section>

      <section className={`${styles.section} ${styles.videoSection}`} id="video"><div className={`${styles.shell} ${styles.videoGrid}`}>
        <div className={styles.sectionIntro}><p className={styles.eyebrow}><span /> 02 / See how it works</p><h2 className={`${styles.displayTitle} ${styles.walkthroughTitle}`}><span>From new opportunity</span><span>to won work.</span></h2><p className={styles.walkthroughCopy}>See how response, calls, inspections, quotes, and follow-up can work as one practical revenue system.</p><div className={styles.videoIndex}><span>Watch</span><strong>Overview</strong></div></div>
        <div className={styles.videoFrame}><div className={styles.videoTopline}><span>Valdes Agency / Field Briefing</span><span>Play film</span></div><div className={styles.videoViewport}>{playing && videoUrl ? <iframe src={videoUrl} title="The Valdes lead-to-quote system walkthrough" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /> : <button type="button" className={styles.playButton} onClick={() => setPlaying(true)} aria-label="Play the lead-to-quote system walkthrough"><span><Play size={24} fill="currentColor" aria-hidden="true" /></span><strong>See the system in motion</strong><small>Inquiry to won work</small></button>}<div className={styles.videoContour} aria-hidden="true" /></div></div>
      </div></section>

      <section className={`${styles.section} ${styles.identitySection}`} id="fit"><div className={styles.sectionNumber} aria-hidden="true">03</div><div className={styles.shell}>
        <div className={styles.identityHeading}><div><p className={styles.darkEyebrow}>Where would the biggest difference come from?</p><h2 className={styles.darkTitle}>Not every waterproofing company needs the same thing.</h2></div><p>You may only need one part. Start with the situation that feels closest to where the business is now.</p></div>
        <div className={styles.situationList}>{situations.map(item => <a href={item.link} key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.copy}</p></div><ArrowRight size={18} aria-hidden="true" /></a>)}</div>
      </div></section>

      <section className={`${styles.section} ${styles.journeySection}`} id="journey"><div className={styles.shell}>
        <div className={styles.splitHeading}><div><p className={styles.darkEyebrow}>The lead-to-quote journey</p><h2 className={styles.darkTitle}>Revenue depends on what happens between the steps.</h2></div><p>Generating the inquiry is only the beginning. Response, inspection, quoting, and follow-up determine whether the opportunity keeps moving.</p></div>
        <ol className={styles.journeyRail}>{journey.map((step,index)=>{const Icon=step.icon; return <li key={step.label}><div className={styles.journeyNode}><span>{String(index+1).padStart(2,"0")}</span><Icon size={21} strokeWidth={1.6} aria-hidden="true" /></div><strong>{step.label}</strong><small>{step.detail}</small>{index<journey.length-1&&<ChevronRight className={styles.railArrow} size={18} aria-hidden="true"/>}</li>})}</ol>
        <p className={styles.journeyNote}>Valdes Agency improves the handoffs that would make the biggest difference. Not every handoff needs replacing.</p>
      </div></section>

      <section className={`${styles.section} ${styles.responseSection}`} id="response"><div className={`${styles.shell} ${styles.offerGrid}`}>
        <div className={styles.offerCopy}><p className={styles.eyebrow}><span /> Instant first response</p><h2 className={styles.displayTitle}>New opportunities shouldn’t have to wait.</h2><p>When an inquiry arrives, a fast, useful conversation can move the homeowner toward the right next step while their intent is still active.</p><div className={styles.poweredBy}>Powered by <strong>Speed-to-Lead Agent</strong></div></div>
        <div className={styles.responseFlow} aria-label="New inquiry to booked inspection"><div><Search size={19}/><span>New inquiry</span></div><i/><div><Clock3 size={19}/><span>Instant response</span></div><i/><div><MessageSquareText size={19}/><span>Conversation</span></div><i/><div><CalendarCheck size={19}/><span>Inspection</span></div></div>
      </div></section>

      <section className={`${styles.section} ${styles.avaSection}`} id="ava"><div className={styles.avaHalo} aria-hidden="true" />
        <div className={`${styles.shell} ${styles.avaHeading}`}><p className={styles.eyebrow}><span /> Calls keep moving</p><h2 className={styles.displayTitle}>When the phone rings, a homeowner needs help. <em>Someone should answer.</em></h2><p>When the team is busy, on a job, or unavailable, Ava can answer common questions, qualify the caller, route the conversation, and help book the inspection.</p></div>
        <div className={`${styles.shell} ${styles.avaConsole}`}><svg className={styles.avaBeamMap} viewBox="0 0 1200 430" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="avaBeamGradient" x1="0" x2="1"><stop offset="0" stopColor="#7eb7ec" stopOpacity="0"/><stop offset="0.48" stopColor="#7eb7ec"/><stop offset="0.72" stopColor="#e19a71"/><stop offset="1" stopColor="#e19a71" stopOpacity="0"/></linearGradient></defs><path className={styles.avaBeamBase} d="M180 210C340 210 370 120 600 120S860 210 1020 210"/><path className={styles.avaBeamPulse} pathLength="1" d="M180 210C340 210 370 120 600 120S860 210 1020 210"/></svg>
          <div className={styles.incomingCall}><div className={styles.callStatus}><span/> Incoming call</div><div className={styles.callerAvatar}><PhoneCall size={28}/></div><p>Homeowner</p><strong>Basement water issue</strong><small><Clock3 size={13}/> Team unavailable</small></div><div className={styles.avaConnector}><span/><i>answered</i></div><div className={styles.avaCore}><div className={styles.avaMark}>A</div><p>Ava</p><strong>Answers · Qualifies · Books</strong><div className={styles.waveform}><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><blockquote>“I can help with that. Let’s find the right next step.”</blockquote></div><div className={styles.avaConnector}><span/><i>moving</i></div><div className={styles.bookedCard}><span><CalendarCheck size={17}/> Inspection booked</span><strong>New opportunity</strong><div><small>Service</small><p>Waterproofing inspection</p></div><div><small>Status</small><p>Team notified</p></div><div className={styles.confirmed}><Check size={14}/> Confirmation sent</div></div>
        </div><div className={`${styles.shell} ${styles.poweredRow}`}>Powered by <strong>Inbound AI Receptionist · Ava</strong></div>
      </section>

      <section className={`${styles.section} ${styles.outboundSection}`} id="outbound"><div className={`${styles.shell} ${styles.outboundGrid}`}>
        <div className={styles.outboundCopy}><p className={styles.darkEyebrow}>Work the opportunities you already have</p><h2 className={styles.darkTitle}>Not every opportunity needs another ad. <em>Some just need another conversation.</em></h2><p>Your team should not have to manually chase every opportunity for it to keep moving. Consistent, thoughtful follow-up can reopen the conversation and clarify the next step.</p><div className={styles.poweredBy}>Powered by <strong>Outbound Agent</strong></div></div>
        <div className={styles.outboundVisual}><div className={styles.opportunityStack}>{outboundGroups.map((group,index)=><div key={group}><span>{String(index+1).padStart(2,"0")}</span><strong>{group}</strong></div>)}</div><div className={styles.reengageCore}><RotateCcw size={22}/><small>Consistent follow-up</small><strong>Conversation restarted</strong><span>Next step identified <ArrowRight size={14}/></span></div></div>
      </div></section>

      <section className={`${styles.section} ${styles.quotingSection}`} id="quoting"><div className={styles.quoteGlow} aria-hidden="true" />
        <div className={`${styles.shell} ${styles.quoteHeading}`}><p className={styles.eyebrow}><span /> Custom quoting infrastructure</p><h2 className={styles.displayTitle}>Get quotes moving without everything waiting on you.</h2><p>Your company already has a way it prices work. We turn that logic into a faster internal workflow built around your process, with team review where it belongs.</p></div>
        <div className={`${styles.shell} ${styles.quoteWorkbench}`}><div className={styles.quoteInputs}><small>Company-specific inputs</small>{quoteInputs.map(item=><span key={item}><Check size={13}/>{item}</span>)}</div><div className={styles.quoteLogic}><Sparkles size={20}/><small>Your company’s quoting logic</small><strong>Built around how you price work</strong></div><div className={styles.quoteReview}><UserRoundCheck size={20}/><small>Owner / team review</small><strong>Judgment stays in the process</strong></div><div className={styles.quoteReady}><FileCheck2 size={23}/><small>Quote ready</small><strong>Prepared for the next step</strong></div></div>
        <div className={`${styles.shell} ${styles.poweredRow}`}>Powered by a custom <strong>Quoting Agent</strong></div>
      </section>

      <section className={`${styles.section} ${styles.demandSection}`} id="demand"><div className={`${styles.shell} ${styles.demandGrid}`}>
        <div className={styles.demandCopy}><p className={styles.darkEyebrow}>When demand is the bottleneck</p><h2 className={styles.darkTitle}>Create more qualified opportunities when the business needs them.</h2><p>When lead flow is the constraint, we can support Google Ads, Meta Ads, SEO, and conversion-focused websites. Demand generation supports the system. It does not define it.</p><div className={styles.keepWhatWorks}><ShieldCheck size={18}/><p><strong>Already have lead flow? Great.</strong><span>We can plug into what is already working, including your current marketing partner.</span></p></div></div>
        <div className={styles.demandEditorial}><span>Demand layer</span><strong>Google Ads · Meta Ads · SEO · Websites</strong><p>Built only when more qualified demand is the next meaningful opportunity.</p><div><MapPin size={16}/> Your services. Your market. Your capacity.</div></div>
      </div></section>

      <section className={`${styles.section} ${styles.systemSection}`} id="system"><div className={styles.systemLines} aria-hidden="true" /><div className={styles.shell}>
        <div className={styles.systemHeading}><p className={styles.eyebrow}><span /> The connected system</p><h2 className={styles.displayTitle}>Keep the opportunity moving.</h2><p>Use one part or connect several. The right system fits around what your business already does well.</p></div>
        <div className={styles.connectedRail}>{connected.map((step,index)=><div className={index===0?styles.connectedDemand:index===connected.length-1?styles.connectedWon:undefined} key={step}><span>{String(index+1).padStart(2,"0")}</span><strong>{step}</strong>{index<connected.length-1&&<i/>}</div>)}</div>
        <div className={styles.trustStatement}><h3>You do not need the whole system.</h3><p>If demand is working, keep it. If your CRM is working, keep it. If your team handles something well, we do not need to replace it.</p><strong>Start with the part that would make the biggest difference.</strong></div>
      </div></section>

      <section className={`${styles.section} ${styles.processSection}`} id="process"><div className={styles.shell}><div className={styles.processHeading}><div><p className={styles.darkEyebrow}>A focused implementation</p><h2 className={styles.darkTitle}>Start where added capacity makes sense.</h2></div><p>No giant package assumption. We understand the current journey, choose the highest-value starting point, and build around the business.</p></div><ol className={styles.processGrid}>{launch.map(phase=><li key={phase.number}><span>{phase.number}</span><div><h3>{phase.title}</h3><p>{phase.copy}</p></div></li>)}</ol></div></section>

      <section className={`${styles.section} ${styles.finalSection}`} id="book"><div className={styles.finalContour} aria-hidden="true" /><div className={`${styles.shell} ${styles.finalStage}`}><div className={styles.finalOrb} aria-hidden="true"/><div className={styles.finalInner}><p className={styles.eyebrow}><span/> A low-pressure next step</p><h2 className={styles.finalTitle}>Find the best place to start.</h2><p>A focused conversation about how opportunities move through the business, where you want to grow, and whether there is a part worth improving.</p><button className={styles.primaryButton} type="button" onClick={openBooking}>See where AI could fit <ArrowRight size={17}/></button><div className={styles.finalRoute}><span>Current situation</span><i/><span>Desired future</span><i/><span>Best opportunity</span></div></div></div>
        <div className={`${styles.shell} ${styles.footerSignature}`} aria-hidden="true"><span>VALDES</span><small>AGENCY</small></div><footer className={`${styles.shell} ${styles.footer}`}><a className={styles.brand} href="#top" aria-label="Back to top"><span className={styles.monogram}><img className={styles.logoImage} src="/images/valdes-agency-mark.png" alt="" /></span><span className={styles.brandName}>Valdes Agency</span></a><p>AI revenue infrastructure for waterproofing companies.</p><div><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a><a href={`tel:${CONTACT.phoneHref}`}>{CONTACT.phone}</a></div><span>© 2026 Valdes Agency</span></footer>
      </section>
    </main>
  );
}
