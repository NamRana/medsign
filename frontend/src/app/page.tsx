"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

// ── Animated Counter ─────────────────────────────────────────────────────────

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <span>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// ── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: `${color}15` }}
      >
        <div style={{ color }}>{icon}</div>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

// ── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="relative text-center">
      <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
        <span className="text-white text-xl font-bold">{number}</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

// ── Testimonial Card ─────────────────────────────────────────────────────────

function TestimonialCard({
  quote,
  name,
  location,
  rating,
}: {
  quote: string;
  name: string;
  location: string;
  rating: number;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
      <div className="flex gap-1 mb-3">
        {Array.from({ length: rating }).map((_, i) => (
          <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <p className="text-sm text-gray-700 leading-relaxed flex-1 italic">&ldquo;{quote}&rdquo;</p>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm font-semibold text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">{location}</p>
      </div>
    </div>
  );
}

// ── Main Landing Page ────────────────────────────────────────────────────────

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? "bg-white/90 backdrop-blur-md shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">MedSign</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-emerald-600 transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-emerald-600 transition-colors">
                How It Works
              </a>
              <a href="#testimonials" className="text-sm text-gray-600 hover:text-emerald-600 transition-colors">
                Testimonials
              </a>
              <a href="#safety" className="text-sm text-gray-600 hover:text-emerald-600 transition-colors">
                Safety
              </a>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-full hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ───────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/80 via-white to-white" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-br from-emerald-100/40 to-teal-100/40 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-6">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">AI-Powered Health Assessment</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight tracking-tight">
            Your Personal
            <br />
            <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Health Assistant
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Get instant, AI-guided health assessments. Describe your symptoms in any Indian language
            and receive personalized insights — accessible, affordable, and always available.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-3.5 rounded-full text-base font-semibold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
            >
              Start Free Assessment
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-8 py-3.5 rounded-full text-base font-medium border border-gray-200 hover:border-emerald-300 hover:text-emerald-700 transition-all"
            >
              See How It Works
            </a>
          </div>

          <p className="mt-4 text-xs text-gray-400">No credit card required. Free health assessments.</p>

          {/* Stats bar */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                <AnimatedNumber target={50000} suffix="+" />
              </div>
              <div className="text-xs text-gray-500 mt-1">Assessments Done</div>
            </div>
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                <AnimatedNumber target={12} suffix="+" />
              </div>
              <div className="text-xs text-gray-500 mt-1">Languages Supported</div>
            </div>
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                <AnimatedNumber target={98} suffix="%" />
              </div>
              <div className="text-xs text-gray-500 mt-1">User Satisfaction</div>
            </div>
          </div>
        </div>

        {/* Phone Mockup */}
        <div className="relative max-w-xs mx-auto mt-16">
          <div className="relative bg-gray-900 rounded-[3rem] p-3 shadow-2xl shadow-gray-300">
            <div className="bg-white rounded-[2.5rem] overflow-hidden">
              <div className="bg-gradient-to-b from-emerald-500 to-teal-600 px-6 py-8 text-white text-center">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <p className="text-sm font-medium">MedSign</p>
                <p className="text-xs text-white/70 mt-1">Health Assessment</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <p className="text-xs text-gray-700">Hello! I&apos;m your health assistant. What symptoms are you experiencing today?</p>
                </div>
                <div className="bg-emerald-500 rounded-2xl rounded-tr-sm px-4 py-2.5 ml-8">
                  <p className="text-xs text-white">I have a headache and mild fever since yesterday</p>
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <p className="text-xs text-gray-700">I understand. Can you tell me the severity of the headache on a scale of 1-10?</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trusted By Banner ──────────────────────────────────────────────── */}
      <section className="py-12 border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-6">
            Built with trusted technology
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 opacity-60">
            <span className="text-lg font-semibold text-gray-400">Google AI</span>
            <span className="text-lg font-semibold text-gray-400">Supabase</span>
            <span className="text-lg font-semibold text-gray-400">Next.js</span>
            <span className="text-lg font-semibold text-gray-400">FastAPI</span>
            <span className="text-lg font-semibold text-gray-400">WHO Guidelines</span>
          </div>
        </div>
      </section>

      {/* ── Features Section ───────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Healthcare that understands you
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Advanced AI trained on medical knowledge, designed specifically for Indian healthcare needs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              }
              title="Symptom Assessment"
              description="Describe your symptoms in plain language. Our AI asks focused follow-up questions to understand your condition thoroughly."
              color="#10B981"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
              }
              title="Multilingual Support"
              description="Speak in Hindi, Tamil, Telugu, Bengali, or any Indian language. Voice and text input supported for accessibility."
              color="#6366F1"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Lab Report Analysis"
              description="Upload your lab reports and get instant AI interpretation. Understand what your values mean in simple language."
              color="#F59E0B"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              title="Health Insights"
              description="Track your health over time with beautiful analytics. See trends, risk factors, and body system scores at a glance."
              color="#EC4899"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
              title="Image Analysis"
              description="Share photos of skin conditions or visible symptoms. AI-powered visual analysis provides additional assessment context."
              color="#8B5CF6"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              }
              title="Doctor-Ready Reports"
              description="Generate clinical summaries you can share with your doctor. Save time during consultations with pre-organized health data."
              color="#14B8A6"
            />
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Simple as talking to a doctor
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Three steps to understand your health better
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-7 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200" />

            <StepCard
              number={1}
              title="Describe Symptoms"
              description="Tell us how you're feeling in your own words — text or voice, in any language you're comfortable with."
            />
            <StepCard
              number={2}
              title="AI Assessment"
              description="Our AI asks smart follow-up questions, analyzes your symptoms against medical knowledge, and identifies patterns."
            />
            <StepCard
              number={3}
              title="Get Guidance"
              description="Receive a clear health summary with risk level, possible conditions, and recommended next steps."
            />
          </div>
        </div>
      </section>

      {/* ── India-Focused Section ──────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-8 sm:p-12 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                  Built for India&apos;s healthcare reality
                </h2>
                <p className="mt-4 text-emerald-100 text-base leading-relaxed">
                  India has 1 doctor for every 1,500 people. Long waits, expensive consultations,
                  and limited access to specialists — especially in tier-2 and tier-3 cities.
                  MedSign bridges this gap.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "Works in Hindi, Tamil, Telugu, Bengali & more",
                    "Understands Indian-specific conditions & medications",
                    "Follows WHO and ICMR clinical guidelines",
                    "Costs a fraction of a clinic visit",
                    "Available 24/7 — no appointments needed",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-emerald-50">
                      <svg className="w-5 h-5 text-emerald-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-center">
                  <div className="text-3xl font-bold">24/7</div>
                  <div className="text-xs text-emerald-200 mt-1">Always Available</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-center">
                  <div className="text-3xl font-bold">2min</div>
                  <div className="text-xs text-emerald-200 mt-1">Avg. Assessment</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-center">
                  <div className="text-3xl font-bold">Free</div>
                  <div className="text-xs text-emerald-200 mt-1">Basic Assessments</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-center">
                  <div className="text-3xl font-bold">500+</div>
                  <div className="text-xs text-emerald-200 mt-1">Conditions Covered</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section id="testimonials" className="py-20 px-4 bg-gray-50/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Trusted by thousands
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              See what our users are saying about MedSign
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TestimonialCard
              quote="I live in a small town where the nearest specialist is 2 hours away. MedSign helped me understand my symptoms and know when I actually needed to make that trip."
              name="Priya Sharma"
              location="Jhansi, Uttar Pradesh"
              rating={5}
            />
            <TestimonialCard
              quote="Being able to speak in Hindi and get a proper assessment was incredible. My mother used it for her joint pain and the doctor summary feature saved us 30 minutes at the clinic."
              name="Rahul Verma"
              location="Indore, Madhya Pradesh"
              rating={5}
            />
            <TestimonialCard
              quote="The lab report analysis is amazing. I uploaded my blood work and finally understood what all those numbers meant. The health insights page shows my progress beautifully."
              name="Ananya Krishnan"
              location="Kochi, Kerala"
              rating={5}
            />
          </div>
        </div>
      </section>

      {/* ── Safety & Privacy ───────────────────────────────────────────────── */}
      <section id="safety" className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5 mb-6">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-xs font-medium text-blue-700">Your Safety Matters</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Safe, private, and transparent
          </h2>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            We take your health data seriously. MedSign is designed with safety and privacy at its core.
          </p>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: "🔒", title: "End-to-End Encryption", desc: "Your health data is encrypted at rest and in transit" },
              { icon: "🏥", title: "Not a Replacement", desc: "We clearly guide you to seek in-person care when needed" },
              { icon: "🛡️", title: "Crisis Detection", desc: "Automatic escalation for emergency situations" },
              { icon: "📋", title: "Medical Standards", desc: "Following WHO and ICMR clinical guidelines" },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                <div className="text-2xl mb-3">{item.icon}</div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 sm:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
                Take control of your health today
              </h2>
              <p className="mt-4 text-base text-gray-300 max-w-xl mx-auto">
                Join thousands of Indians who are using AI to understand their health better.
                Start with a free assessment — no registration required.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/signup"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 text-white px-8 py-3.5 rounded-full text-base font-semibold hover:bg-emerald-400 transition-all"
                >
                  Get Started Free
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <span className="text-base font-bold text-gray-900">MedSign</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                AI-powered health assessment platform built for India. Making quality healthcare guidance accessible to everyone.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="text-xs text-gray-500 hover:text-emerald-600">Features</a></li>
                <li><a href="#how-it-works" className="text-xs text-gray-500 hover:text-emerald-600">How It Works</a></li>
                <li><a href="#safety" className="text-xs text-gray-500 hover:text-emerald-600">Safety</a></li>
                <li><Link href="/login" className="text-xs text-gray-500 hover:text-emerald-600">Sign In</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Health</h4>
              <ul className="space-y-2">
                <li><span className="text-xs text-gray-500">Symptom Checker</span></li>
                <li><span className="text-xs text-gray-500">Lab Analysis</span></li>
                <li><span className="text-xs text-gray-500">Health Insights</span></li>
                <li><span className="text-xs text-gray-500">Doctor Summary</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Legal</h4>
              <ul className="space-y-2">
                <li><span className="text-xs text-gray-500">Privacy Policy</span></li>
                <li><span className="text-xs text-gray-500">Terms of Service</span></li>
                <li><span className="text-xs text-gray-500">Medical Disclaimer</span></li>
                <li><span className="text-xs text-gray-500">Data Protection</span></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              &copy; 2026 MedSign. All rights reserved.
            </p>
            <p className="text-[10px] text-gray-400 max-w-md text-center sm:text-right">
              MedSign is not a substitute for professional medical advice, diagnosis, or treatment.
              Always seek the advice of your physician or qualified health provider.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
