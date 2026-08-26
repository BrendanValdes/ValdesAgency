"use client";

import { useRef } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Camera,
  Check,
  Droplets,
  Send,
  Sparkles,
} from "lucide-react";
import SectionReveal from "@/components/SectionReveal";
import { SECTION_CONTENT } from "@/lib/copy";
import heroPool from "@/src/assets/hero-pool.webp";
import poolBefore from "@/src/assets/pool-before.webp";
import poolAfter from "@/src/assets/pool-after.webp";

gsap.registerPlugin(ScrollTrigger);

export default function ContentSystemSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const collageRef = useRef<HTMLDivElement>(null);
  const [headlineLead, headlineAccent] = SECTION_CONTENT.headline.split("\n");

  useGSAP(
    () => {
      if (!collageRef.current) return;

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const mainImage = collageRef.current.querySelector(
        "[data-content-main]"
      );
      const floatingCards = collageRef.current.querySelectorAll(
        "[data-content-card]"
      );
      const processStrip = collageRef.current.querySelector(
        "[data-content-process]"
      );

      if (reduceMotion) {
        gsap.set([mainImage, ...floatingCards, processStrip], {
          clearProps: "all",
          opacity: 1,
          y: 0,
        });
        return;
      }

      const reveal = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 72%",
          once: true,
        },
      });

      reveal
        .from(mainImage, {
          opacity: 0,
          y: 20,
          duration: 0.62,
          ease: "power2.out",
        })
        .from(
          floatingCards,
          {
            opacity: 0,
            y: 14,
            duration: 0.54,
            stagger: 0.1,
            ease: "power2.out",
          },
          "-=0.24"
        )
        .from(
          processStrip,
          {
            opacity: 0,
            y: 10,
            duration: 0.5,
            ease: "power2.out",
          },
          "-=0.32"
        );
    },
    { scope: sectionRef }
  );

  return (
    <SectionReveal id="content-system" from="right">
      <section
        ref={sectionRef}
        className="relative isolate flex min-h-screen items-center overflow-hidden bg-[#f7fbff] px-[clamp(24px,5vw,72px)] py-[clamp(72px,11vh,128px)] text-[#081f35]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-8%] top-[15%] -z-10 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(44,180,235,0.2)_0%,rgba(74,166,255,0.09)_38%,rgba(247,251,255,0)_72%)] blur-2xl"
        />

        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-14 lg:grid-cols-[0.78fr_1.22fr] lg:gap-[clamp(72px,8vw,128px)]">
          <div className="relative z-10 flex max-w-[550px] flex-col">
            <p className="font-mono-accent mb-6 text-[11px] font-medium uppercase leading-relaxed tracking-[0.2em] text-[#087af4] sm:text-xs">
              {SECTION_CONTENT.label}
            </p>

            <h2
              className="font-display text-[#081f35]"
              style={{
                fontSize: "clamp(40px, 5.3vw, 72px)",
                lineHeight: 0.98,
                letterSpacing: "-0.045em",
              }}
            >
              <span className="block">{headlineLead}</span>
              <span className="mt-1 block text-[#087af4]">
                {headlineAccent}
              </span>
            </h2>

            <p
              className="mt-7 max-w-[540px] text-[#405a70]"
              style={{
                fontSize: "clamp(16px, 1.25vw, 18px)",
                lineHeight: 1.7,
              }}
            >
              {SECTION_CONTENT.body}
            </p>

            <div className="mt-9 flex flex-wrap gap-2.5">
              {SECTION_CONTENT.tags?.map((tag) => (
                <span
                  key={tag}
                  className="font-mono-accent inline-flex items-center rounded-full border border-[#c9ddec] bg-white/80 px-3.5 py-2 text-[10px] font-medium uppercase leading-none tracking-[0.07em] text-[#35536b] shadow-[0_5px_20px_rgba(15,73,110,0.05)] sm:text-[11px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div
            ref={collageRef}
            className="relative mx-auto h-[610px] w-full max-w-[690px] sm:h-[650px] lg:h-[680px]"
          >
            <div
              data-content-main
              className="absolute left-[4%] top-0 aspect-[5/4] w-[92%] overflow-hidden rounded-[28px] border border-white/80 bg-[#dff5ff] shadow-[0_35px_90px_rgba(12,70,106,0.18),0_10px_28px_rgba(12,70,106,0.1)] sm:left-[8%] sm:w-[84%] sm:rounded-[34px]"
            >
              <Image
                src={heroPool}
                alt="A professionally cleaned desert pool with clear blue water"
                fill
                sizes="(max-width: 1023px) 92vw, 48vw"
                className="object-cover object-[58%_center]"
                placeholder="blur"
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#05263e]/65 to-transparent" />
              <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-white/30 bg-[#06263e]/65 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md sm:bottom-6 sm:left-6">
                <Droplets aria-hidden="true" size={14} strokeWidth={2} />
                Swim-ready finish
              </div>
            </div>

            <article
              data-content-card
              className="absolute bottom-[76px] left-0 z-20 w-[min(72%,310px)] overflow-hidden rounded-[22px] border border-[#d8e8f2] bg-white p-3 shadow-[0_22px_55px_rgba(8,50,78,0.18)] sm:bottom-[66px] sm:w-[320px] sm:rounded-[24px] sm:p-3.5"
            >
              <div className="mb-2.5 flex items-center justify-between px-0.5">
                <p className="font-mono-accent text-[9px] font-semibold uppercase tracking-[0.15em] text-[#087af4] sm:text-[10px]">
                  Before / After
                </p>
                <span className="flex items-center gap-1 text-[9px] font-medium text-[#557084] sm:text-[10px]">
                  <Sparkles aria-hidden="true" size={11} />
                  Transformation
                </span>
              </div>

              <div className="grid h-[104px] grid-cols-2 overflow-hidden rounded-[14px] sm:h-[120px]">
                <div className="relative">
                  <Image
                    src={poolBefore}
                    alt="Pool with green water before professional treatment"
                    fill
                    sizes="160px"
                    className="object-cover object-center"
                    placeholder="blur"
                  />
                  <span className="absolute bottom-2 left-2 rounded-full bg-[#173142]/75 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
                    Before
                  </span>
                </div>
                <div className="relative">
                  <Image
                    src={poolAfter}
                    alt="The same pool with clear blue water after professional treatment"
                    fill
                    sizes="160px"
                    className="object-cover object-center"
                    placeholder="blur"
                  />
                  <span className="absolute bottom-2 left-2 rounded-full bg-[#087af4]/85 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
                    After
                  </span>
                </div>
              </div>

              <p className="px-0.5 pt-3 text-[12px] font-semibold leading-snug text-[#102d43] sm:text-[13px]">
                From problem pool to swim-ready.
              </p>
            </article>

            <article
              data-content-card
              className="absolute right-0 top-[41%] z-30 w-[min(52%,236px)] rounded-[20px] border border-[#d8e8f2] bg-white p-4 shadow-[0_20px_48px_rgba(8,50,78,0.16)] sm:right-[1%] sm:top-[42%] sm:w-[250px] sm:rounded-[22px] sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e2f6ff] text-[#087af4] sm:h-9 sm:w-9">
                  <Droplets aria-hidden="true" size={17} strokeWidth={2} />
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-[#edf9f2] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#237a4b] sm:text-[9px]">
                  <Check aria-hidden="true" size={10} strokeWidth={2.5} />
                  Published
                </span>
              </div>
              <p className="font-mono-accent mt-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#087af4] sm:text-[10px]">
                Pool Care Tip
              </p>
              <p className="mt-2 text-[11px] font-semibold leading-[1.45] text-[#17364d] sm:text-[13px]">
                Check chlorine twice weekly during peak summer heat.
              </p>
            </article>

            <div
              data-content-process
              className="absolute bottom-0 right-0 z-20 flex w-[min(82%,440px)] items-center justify-between gap-2 rounded-[18px] border border-[#d4e7f2] bg-[#fafdff]/95 p-2.5 shadow-[0_16px_38px_rgba(8,50,78,0.12)] backdrop-blur-md sm:right-[4%] sm:rounded-[20px] sm:p-3"
              aria-label="Job photo becomes a polished, published post"
            >
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e2f3ff] text-[#087af4]">
                  <Camera aria-hidden="true" size={13} />
                </span>
                <span className="text-[8px] font-semibold text-[#29475d] sm:text-[10px]">
                  Job photo
                </span>
              </div>
              <span aria-hidden="true" className="text-[10px] text-[#8db3ca]">
                →
              </span>
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e2f3ff] text-[#087af4]">
                  <Sparkles aria-hidden="true" size={13} />
                </span>
                <span className="text-[8px] font-semibold text-[#29475d] sm:text-[10px]">
                  Polished post
                </span>
              </div>
              <span aria-hidden="true" className="text-[10px] text-[#8db3ca]">
                →
              </span>
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#087af4] text-white">
                  <Send aria-hidden="true" size={12} />
                </span>
                <span className="text-[8px] font-semibold text-[#29475d] sm:text-[10px]">
                  Published
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SectionReveal>
  );
}
