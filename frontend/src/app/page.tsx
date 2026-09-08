"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";

type DemoId = "symptoms" | "reports" | "scan" | "medicines";

interface DemoMode {
  id: DemoId;
  label: string;
  icon: string;
  prompt: string;
  input: string;
  signal: string;
  summary: string;
  nextStep: string;
  score: number;
}

const DEMO_MODES: DemoMode[] = [
  {
    id: "symptoms",
    label: "Symptoms",
    icon: "✦",
    prompt: "What changed today?",
    input: "Headache + mild fever since yesterday",
    signal: "AI symptom assessment ready",
    summary: "AI organizes your symptoms, surfaces possible conditions, and makes the next questions easier to answer.",
    nextStep: "Clarify duration, severity, and urgent warning signs.",
    score: 72,
  },
  {
    id: "reports",
    label: "Lab report",
    icon: "⌁",
    prompt: "Make the numbers understandable",
    input: "CBC report · 3 values need context",
    signal: "AI report analysis ready",
    summary: "AI flags values against report ranges, explains the context in plain language, and prepares questions for review.",
    nextStep: "Create a simple, doctor-ready discussion summary.",
    score: 84,
  },
  {
    id: "scan",
    label: "Visual check",
    icon: "◌",
    prompt: "Track a visible change",
    input: "New image · compare with your notes",
    signal: "AI visual context prepared",
    summary: "AI can organize visual observations alongside symptoms and history to add context to a care conversation.",
    nextStep: "Track changes and decide when to seek in-person care.",
    score: 64,
  },
  {
    id: "medicines",
    label: "Medication",
    icon: "▣",
    prompt: "Bring prescription context together",
    input: "Symptoms + report notes + existing prescription",
    signal: "AI medicine guidance ready",
    summary: "AI brings medication history and health context together to prepare medicine guidance for professional review.",
    nextStep: "Review medication suitability, dose, and any prescription with a qualified clinician.",
    score: 88,
  },
];

const WORKFLOW_STEPS = [
  {
    id: "understand",
    number: "01",
    title: "Start naturally",
    text: "Speak, type, upload a report, or capture a concern in the format that is easiest for you.",
    output: "Your concern becomes organized context.",
  },
  {
    id: "connect",
    number: "02",
    title: "See the signal",
    text: "MedSign connects the details you share into a calm, readable view of what matters next.",
    output: "The important questions come into focus.",
  },
  {
    id: "act",
    number: "03",
    title: "Move with clarity",
    text: "Keep your notes, follow-up prompts, and shareable summary together for your next decision.",
    output: "You leave with a practical next step.",
  },
];

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 1300;
    const startedAt = performance.now();
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return <>{count.toLocaleString()}{suffix}</>;
}

function SignalMeter({ score }: { score: number }) {
  const fill = Math.max(0, Math.min(100, score)) * 3.6;

  return (
    <div className="landing-signal-meter" aria-label={"Example clarity signal: " + score + " out of 100"}>
      <div
        className="landing-signal-meter-ring"
        style={{ background: "conic-gradient(#5eead4 0deg, #38bdf8 " + fill + "deg, rgba(255,255,255,.12) " + fill + "deg 360deg)" }}
      >
        <div className="landing-signal-meter-center">
          <span>{score}</span>
          <small>signal</small>
        </div>
      </div>
    </div>
  );
}

function FeatureIcon({ type }: { type: "conversation" | "report" | "timeline" | "share" }) {
  const common = "w-6 h-6";

  if (type === "conversation") {
    return <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M7 16H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" /></svg>;
  }
  if (type === "report") {
    return <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-4-6zM14 2v6h4M8 13h8M8 17h5" /></svg>;
  }
  if (type === "timeline") {
    return <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V5m0 14h16M8 15l3-3 3 2 5-6" /></svg>;
  }
  return <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V4m0 12l-4-4m4 4l4-4M5 20h14" /></svg>;
}

function ProductFeature({
  type,
  label,
  title,
  children,
}: {
  type: "conversation" | "report" | "timeline" | "share";
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="landing-product-feature">
      <div className="landing-product-icon"><FeatureIcon type={type} /></div>
      <p className="landing-product-label">{label}</p>
      <h3>{title}</h3>
      <p>{children}</p>
      <span className="landing-product-line" />
    </article>
  );
}

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeDemo, setActiveDemo] = useState<DemoId>("symptoms");
  const [activeWorkflow, setActiveWorkflow] = useState("understand");
  const demo = DEMO_MODES.find((item) => item.id === activeDemo) ?? DEMO_MODES[0];
  const workflow = WORKFLOW_STEPS.find((item) => item.id === activeWorkflow) ?? WORKFLOW_STEPS[0];

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="landing-next landing-shell min-h-screen">
      <nav className={"landing-nav fixed top-0 left-0 right-0 z-50 " + (isScrolled ? "landing-nav-scrolled" : "")}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px]">
            <BrandLogo />
            <div className="hidden md:flex items-center gap-7">
              <a href="#experience" className="landing-nav-link">Experience</a>
              <a href="#how-it-works" className="landing-nav-link">How it works</a>
              <a href="#safety" className="landing-nav-link">Safety</a>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/login" className="landing-login-link">Sign in</Link>
              <Link href="/signup" className="landing-button-shine landing-nav-cta">Explore Care OS <span aria-hidden="true">↗</span></Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <section className="landing-next-hero relative overflow-hidden pt-32 sm:pt-40 pb-16 sm:pb-24 px-4">
          <div className="landing-next-grid absolute inset-0" />
          <div className="landing-next-orb landing-next-orb-one" />
          <div className="landing-next-orb landing-next-orb-two" />
          <div className="landing-next-orb landing-next-orb-three" />

          <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[1.04fr_.96fr] gap-12 lg:gap-10 items-center">
            <div className="landing-hero-copy">
              <div className="landing-system-chip">
                <span className="landing-system-chip-dot" />
                <span>AI-powered health understanding</span>
              </div>

              <h1 className="landing-next-title">
                Understand what your symptoms and reports may be telling you.
                <span>Get a clearer next step before you see a doctor.</span>
              </h1>

              <p className="landing-next-lede">
                MedSign uses AI to connect your symptoms, lab reports, medicines, and observations into plain-language context—so you can spot important questions and have a more informed conversation with a qualified clinician.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <Link href="/signup" className="landing-button-shine landing-primary-cta">
                  Start free AI assessment
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-5-5 5 5-5 5" /></svg>
                </Link>
                <a href="#experience" className="landing-secondary-cta">
                  <span className="landing-play-mark">▶</span>
                  See how MedSign works
                </a>
              </div>

              <div className="landing-hero-proof">
                <div><span className="landing-proof-mark">✓</span> AI symptom assessments</div>
                <div><span className="landing-proof-mark">✓</span> AI lab-report analysis</div>
                <div><span className="landing-proof-mark">✓</span> Medicine guidance with professional review</div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">AI-generated health information for non-emergencies. Review clinical decisions with a qualified professional.</p>
            </div>

            <div className="landing-console-stage">
              <div className="landing-console-backlight" />
              <div className="landing-console">
                <div className="landing-console-topline">
                  <div className="flex items-center gap-2">
                    <span className="landing-console-brand-dot" />
                    <span>MEDSIGN CARE OS</span>
                  </div>
                  <span className="landing-console-live"><i /> Live preview</span>
                </div>

                <div className="landing-console-header">
                  <div>
                    <p>YOUR CARE SIGNAL</p>
                    <h2>Make the next step clearer.</h2>
                  </div>
                  <SignalMeter score={demo.score} />
                </div>

                <div className="landing-console-tabs" aria-label="Explore MedSign inputs">
                  {DEMO_MODES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={activeDemo === item.id}
                      className={"landing-console-tab " + (activeDemo === item.id ? "landing-console-tab-active" : "")}
                      onClick={() => setActiveDemo(item.id)}
                    >
                      <span>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>

                <div className="landing-console-body" aria-live="polite">
                  <div className="landing-console-input">
                    <div className="landing-console-input-label"><span className="landing-console-small-dot" /> {demo.prompt}</div>
                    <p>{demo.input}</p>
                  </div>

                  <div className="landing-console-stream"><span /><span /><span /></div>

                  <div className="landing-console-result">
                    <div className="landing-console-result-icon">✦</div>
                    <div>
                      <p>{demo.signal}</p>
                      <strong>{demo.summary}</strong>
                    </div>
                  </div>

                  <div className="landing-console-next">
                    <span>Next layer</span>
                    <p>{demo.nextStep}</p>
                  </div>
                </div>

                <div className="landing-console-footer">
                  <span><i /> Your data stays in your care space</span>
                  <span>Interactive demo</span>
                </div>
              </div>

              <div className="landing-console-float landing-console-float-left"><span>01</span><p>Capture what changed</p></div>
              <div className="landing-console-float landing-console-float-right"><span className="landing-float-pulse" /><p>Context, not confusion</p></div>
            </div>
          </div>

          <div className="relative max-w-7xl mx-auto mt-16 sm:mt-20">
            <div className="landing-hero-stats">
              <div><strong><AnimatedNumber target={3} /></strong><span>ways to begin: talk, upload, or track</span></div>
              <div><strong><AnimatedNumber target={1} /></strong><span>connected place for your care context</span></div>
              <div><strong><AnimatedNumber target={24} suffix="/7" /></strong><span>access to your personal care workspace</span></div>
            </div>
          </div>
        </section>

        <section id="experience" className="landing-experience py-20 sm:py-28 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="landing-section-heading">
              <div><p className="landing-kicker">THE EXPERIENCE</p><h2>Less searching. More signal.</h2></div>
              <p>Every surface is built to make health information feel less overwhelming and more useful in the moment you need it.</p>
            </div>

            <div className="landing-product-grid">
              <ProductFeature type="conversation" label="01 · AI SYMPTOM ASSESSMENT" title="Turn symptoms into an AI assessment.">
                Describe a concern in your own words. AI organizes the details, surfaces possible conditions, and prepares next questions for professional review.
              </ProductFeature>
              <ProductFeature type="report" label="02 · AI LAB-REPORT ANALYSIS" title="Make report values readable.">
                AI reads report values, flags results against the reference ranges shown, and puts the context into plain language before your next appointment.
              </ProductFeature>
              <ProductFeature type="timeline" label="03 · AI HEALTH CONTEXT" title="Connect the details that matter.">
                AI brings symptoms, activities, reminders, and observations together so it is easier to notice what has changed over time.
              </ProductFeature>
              <ProductFeature type="share" label="04 · AI PRESCRIPTION GUIDANCE" title="Prepare a safer medication review.">
                AI brings symptoms, images, reports, and existing prescription context together to generate medicine guidance that needs qualified professional review.
              </ProductFeature>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-flow-section py-20 sm:py-28 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-2xl mx-auto">
              <p className="landing-kicker">HOW THE SIGNAL MOVES</p>
              <h2 className="landing-flow-title">A simple flow, made visible.</h2>
              <p className="landing-flow-lede">Select a stage to see how MedSign turns a health question into a clearer next conversation.</p>
            </div>

            <div className="landing-flow-layout mt-12">
              <div className="landing-flow-steps">
                {WORKFLOW_STEPS.map((step) => (
                  <button
                    type="button"
                    key={step.id}
                    onClick={() => setActiveWorkflow(step.id)}
                    className={"landing-flow-step " + (activeWorkflow === step.id ? "landing-flow-step-active" : "")}
                    aria-pressed={activeWorkflow === step.id}
                  >
                    <span className="landing-flow-number">{step.number}</span>
                    <span><strong>{step.title}</strong><small>{step.text}</small></span>
                    <span className="landing-flow-arrow">→</span>
                  </button>
                ))}
              </div>

              <aside className="landing-flow-preview" aria-live="polite">
                <div className="landing-flow-preview-grid" />
                <p className="landing-flow-preview-label">ACTIVE STAGE · {workflow.number}</p>
                <h3>{workflow.title}</h3>
                <p>{workflow.text}</p>
                <div className="landing-flow-preview-output"><span>OUTPUT</span><strong>{workflow.output}</strong></div>
                <div className="landing-flow-beam"><i /><i /><i /></div>
              </aside>
            </div>
          </div>
        </section>

        <section id="safety" className="landing-safety py-20 sm:py-28 px-4">
          <div className="max-w-7xl mx-auto landing-safety-panel">
            <div className="landing-safety-glow" />
            <div className="relative grid lg:grid-cols-[.9fr_1.1fr] gap-10 lg:gap-16 items-start">
              <div>
                <div className="landing-safety-chip"><span>◈</span> BUILT WITH CARE</div>
                <h2>Confident design means being clear about the limits.</h2>
                <p>MedSign is designed to help organize health information and support care conversations. It does not replace a clinician, emergency services, or professional diagnosis.</p>
                <Link href="/signup" className="landing-safety-cta">Create your care space <span aria-hidden="true">→</span></Link>
              </div>
              <div className="landing-safety-list">
                <article><span className="landing-safety-icon">⌘</span><div><h3>Privacy-aware by design</h3><p>Health context belongs in a personal space designed for thoughtful access and control.</p></div></article>
                <article><span className="landing-safety-icon">!</span><div><h3>Clear escalation cues</h3><p>When a concern needs in-person or emergency care, the product should make that next step easy to recognize.</p></div></article>
                <article><span className="landing-safety-icon">↗</span><div><h3>Medication decisions need professional review</h3><p>Use AI-generated context to prepare questions, then verify medicine, dose, and prescription decisions with an appropriately qualified practitioner.</p></div></article>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-final-cta px-4 pb-20 sm:pb-28">
          <div className="max-w-7xl mx-auto landing-final-card">
            <div className="landing-final-grid" />
            <div className="relative">
              <p className="landing-kicker !text-teal-100">YOUR NEXT CLEARER STEP</p>
              <h2>Bring your health story into focus.</h2>
              <p>Start a private care space for the questions, reports, reminders, and conversations that matter to you.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Link href="/signup" className="landing-final-primary">Get started free <span aria-hidden="true">→</span></Link>
                <Link href="/login" className="landing-final-secondary">Already a member? Sign in</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer border-t border-teal-100/70 px-4 py-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div>
            <BrandLogo iconClassName="w-7 h-7" wordmarkClassName="text-base" compact />
            <p className="mt-3 max-w-md text-xs text-slate-500 leading-relaxed">MedSign helps people organize health context for clearer next steps. It is not a substitute for professional medical advice, diagnosis, or treatment.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
            <Link href="/ai-lab-report-analyzer" className="hover:text-teal-700">Lab report analyzer</Link>
            <Link href="/ai-symptom-checker" className="hover:text-teal-700">Symptom guidance</Link>
            <Link href="/online-prescription" className="hover:text-teal-700">Prescription guidance</Link>
            <Link href="/how-it-works" className="hover:text-teal-700">How MedSign works</Link>
            <Link href="/medical-safety" className="hover:text-teal-700">Medical safety</Link>
            <a href="#experience" className="hover:text-teal-700">Experience</a>
            <a href="#safety" className="hover:text-teal-700">Safety</a>
            <Link href="/login" className="hover:text-teal-700">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
