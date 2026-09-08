"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getBillingStatus,
  createSubscription,
  verifyPayment,
  cancelSubscription,
} from "@/lib/api";
import type { BillingStatus } from "@/lib/api";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const FREE_FEATURES = [
  { name: "Health Assessments", value: "3 / month" },
  { name: "Lab Report Upload", value: "1 / month" },
  { name: "Face Scans", value: "3 / month" },
  { name: "Image Analysis", value: "1 / month" },
  { name: "Hindi Language", included: false },
  { name: "AI Medical History", included: false },
];

const PRO_FEATURES = [
  { name: "Health Assessments", value: "Unlimited" },
  { name: "Lab Report Upload", value: "Unlimited" },
  { name: "Face Scans", value: "Unlimited" },
  { name: "Image Analysis", value: "Unlimited" },
  { name: "Hindi Language", included: true },
  { name: "AI Medical History", included: true },
];

export default function PricingPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingState, setBillingState] = useState<"loading" | "ready" | "error">("loading");
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (billing?.monetization_enabled !== true) return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const markCheckoutReady = () => setCheckoutReady(true);
    const reportCheckoutError = () => setMessage({ type: "error", text: "Checkout could not be loaded. Please try again later." });
    script.addEventListener("load", markCheckoutReady);
    script.addEventListener("error", reportCheckoutError);
    document.body.appendChild(script);
    return () => {
      script.removeEventListener("load", markCheckoutReady);
      script.removeEventListener("error", reportCheckoutError);
      document.body.removeChild(script);
    };
  }, [billing?.monetization_enabled]);

  useEffect(() => {
    let cancelled = false;
    getBillingStatus()
      .then((data) => {
        if (cancelled) return;
        setBilling(data);
        setBillingState("ready");
      })
      .catch(() => {
        if (!cancelled) setBillingState("error");
      });
    return () => { cancelled = true; };
  }, []);

  const isPro = billing?.plan === "pro" && billing?.status === "active";

  async function handleSubscribe() {
    if (
      billing?.monetization_enabled !== true ||
      !checkoutReady ||
      typeof window.Razorpay !== "function"
    ) {
      setMessage({ type: "error", text: "Subscription checkout is not ready. Please try again in a moment." });
      return;
    }
    setSubscribing(true);
    setMessage(null);
    try {
      const data = await createSubscription();

      const options = {
        key: data.razorpay_key_id,
        subscription_id: data.subscription_id,
        name: data.name,
        description: data.description,
        currency: data.currency,
        theme: { color: "#059669" },
        handler: async (response: { razorpay_subscription_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verifyPayment({
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setMessage({ type: "success", text: "Welcome to MedSign Pro! Enjoy unlimited access." });
            const updated = await getBillingStatus();
            setBilling(updated);
          } catch {
            setMessage({ type: "error", text: "Payment verification failed. Please contact support." });
          }
        },
        modal: {
          ondismiss: () => setSubscribing(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setMessage({ type: "error", text: "Could not initiate payment. Please try again." });
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel your Pro subscription?")) return;
    setCancelling(true);
    try {
      await cancelSubscription();
      setMessage({ type: "success", text: "Subscription cancelled." });
      const updated = await getBillingStatus();
      setBilling(updated);
    } catch {
      setMessage({ type: "error", text: "Failed to cancel. Please try again." });
    } finally {
      setCancelling(false);
    }
  }

  if (billingState === "loading") {
    return (
      <div className="min-h-screen care-os care-grid">
        <main className="care-content max-w-md mx-auto px-5 py-24 text-center">
          <div className="w-9 h-9 mx-auto border-4 border-teal-100 border-t-teal-600 rounded-full animate-spin" />
          <p className="mt-5 text-sm font-medium text-slate-600">Loading access details…</p>
        </main>
      </div>
    );
  }

  if (billingState === "error" || !billing) {
    return (
      <div className="min-h-screen care-os care-grid">
        <main className="care-content max-w-md mx-auto px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-slate-900">Could not load access details</h1>
          <p className="mt-2 text-sm text-slate-500">Please check your connection and try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition"
          >
            Try again
          </button>
        </main>
      </div>
    );
  }

  if (!billing.monetization_enabled) {
    return (
      <div className="min-h-screen care-os care-grid">
        <header className="care-hero border-b border-white/10 shadow-none">
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
            <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-white/70 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span className="text-sm font-medium">Back</span>
            </button>
            <h1 className="text-sm font-bold tracking-[.16em] uppercase text-white/90">MedSign</h1>
            <div className="w-16" />
          </div>
        </header>

        <main className="care-content max-w-2xl mx-auto px-5 py-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-100 mb-5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Early access
          </div>
          <p className="care-eyebrow !text-teal-700 mb-2">Care intelligence, without limits</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#083b42] mb-4">Everything is free while we grow</h2>
          <p className="text-slate-500 text-lg leading-relaxed max-w-xl mx-auto">
            Use every MedSign feature as much as you need. We&apos;re collecting feedback and usage data to make the product better before bringing plans back.
          </p>

          <section className="mt-9 rounded-3xl border border-teal-100 bg-white/80 shadow-sm p-7 text-left">
            <h3 className="text-lg font-bold text-slate-900">Included for everyone</h3>
            <div className="grid sm:grid-cols-2 gap-x-7 gap-y-4 mt-5">
              {["Unlimited health assessments", "Unlimited lab report uploads", "Unlimited face scans", "Unlimited image analysis", "AI health history", "Hindi language support"].map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-sm text-slate-700">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  {feature}
                </div>
              ))}
            </div>
          </section>

          {message && (
            <p className={`mt-5 text-sm font-medium ${message.type === "success" ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>
          )}

          {isPro && (
            <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left">
              <h3 className="text-sm font-bold text-amber-900">Your existing Pro subscription is still active</h3>
              <p className="mt-1 text-sm text-amber-800">All features are currently free for everyone. Cancel this recurring subscription below if you do not want it to renew.</p>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="mt-4 w-full py-2.5 text-center text-sm font-semibold text-red-700 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel Subscription"}
              </button>
            </section>
          )}

          <p className="mt-7 text-sm text-slate-500">We&apos;ll let you know before paid plans return. Your account and health records stay yours.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen care-os care-grid care-pricing-page">
      <style>{`
        .care-pricing-page .care-pricing-header { background: linear-gradient(132deg, #071a21 0%, #0a3b43 58%, #075e64 100%); border-bottom: 1px solid rgba(153,246,228,.16); box-shadow: 0 14px 34px rgba(8,47,73,.16); }
        .care-pricing-page .care-pricing-header::after { content: ""; position: absolute; width: 17rem; height: 17rem; border-radius: 9999px; right: -5rem; top: -10rem; background: rgba(103,232,249,.15); filter: blur(8px); }
        .care-pricing-page .care-pricing-badge { border: 1px solid rgba(45,212,191,.28); background: rgba(240,253,250,.84); color: #0f766e; box-shadow: 0 10px 25px rgba(8,47,73,.06); }
        .care-pricing-page .care-plan { overflow: visible; border-color: rgba(207,231,230,.9); box-shadow: 0 18px 44px rgba(8,47,73,.08); backdrop-filter: blur(18px) saturate(1.08); }
        .care-pricing-page .care-plan-free { background: rgba(255,255,255,.78); }
        .care-pricing-page .care-plan-current { border-color: rgba(45,212,191,.72); box-shadow: 0 0 0 2px rgba(45,212,191,.14), 0 22px 50px rgba(8,47,73,.12); }
        .care-pricing-page .care-plan-pro { isolation: isolate; overflow: hidden; color: white; background: linear-gradient(145deg, #061d26 0%, #0a3b43 56%, #075e64 100%); border-color: rgba(94,234,212,.24); box-shadow: 0 24px 56px rgba(8,47,73,.23); }
        .care-pricing-page .care-plan-pro::after { content: ""; position: absolute; z-index: -1; width: 17rem; height: 17rem; right: -7rem; top: -8rem; border-radius: 9999px; background: rgba(45,212,191,.18); filter: blur(14px); }
        .care-pricing-page .care-plan-pro .text-gray-900,
        .care-pricing-page .care-plan-pro .text-gray-700 { color: #f0fdfa !important; }
        .care-pricing-page .care-plan-pro .text-gray-400 { color: rgba(204,251,241,.65) !important; }
        .care-pricing-page .care-plan-pro .text-emerald-500 { color: #5eead4 !important; }
        .care-pricing-page .care-plan-pro .text-emerald-600 { color: #99f6e4 !important; }
        .care-pricing-page .care-plan-pro .bg-gradient-to-r { background-image: linear-gradient(105deg, #99f6e4 0%, #67e8f9 100%) !important; }
        .care-pricing-page .care-plan-pro .bg-clip-text { color: transparent !important; }
        .care-pricing-page .care-pricing-cta { color: #073b42; background: linear-gradient(105deg, #d1fae5 0%, #a5f3fc 100%); box-shadow: 0 12px 26px rgba(0,0,0,.18); }
        .care-pricing-page .care-pricing-cta:hover { transform: translateY(-2px); box-shadow: 0 17px 32px rgba(0,0,0,.24); }
        .care-pricing-page .care-usage-card,
        .care-pricing-page .care-faq-card { background: rgba(255,255,255,.78); border-color: rgba(207,231,230,.9); box-shadow: 0 13px 28px rgba(8,47,73,.06); backdrop-filter: blur(16px); }
        .care-pricing-page .care-usage-meter { background: rgba(13,148,136,.10); }
        .care-pricing-page .care-pricing-message { box-shadow: 0 12px 30px rgba(8,47,73,.06); }
        @media (max-width: 440px) { .care-pricing-page .care-pricing-header-title { display: none; } }
      `}</style>
      {/* Header */}
      <header className="care-pricing-header relative overflow-hidden sticky top-0 z-20">
        <div className="relative z-10 max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-white/70 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            <span className="text-sm font-medium">Back</span>
          </button>
          <h1 className="care-pricing-header-title text-sm font-bold tracking-[.16em] uppercase text-white/90">MedSign Pro</h1>
          <div className="w-16" />
        </div>
      </header>

      <div className="care-content max-w-5xl mx-auto px-5 py-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="care-pricing-badge inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            Upgrade your health intelligence
          </div>
          <p className="care-eyebrow !text-teal-700 mb-2">Care intelligence, without limits</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#083b42] mb-3">Choose Your Care OS Plan</h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">Bring your assessments, records, and health signals into one continuous care system.</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`care-pricing-message max-w-lg mx-auto mb-8 px-5 py-3 rounded-xl text-sm font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.text}
          </div>
        )}

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free Plan */}
          <div className={`care-plan care-plan-free relative rounded-3xl border p-7 transition ${!isPro ? "care-plan-current" : ""}`}>
            {!isPro && <div className="absolute -top-3 left-6 px-3 py-0.5 bg-emerald-600 text-white text-xs font-bold rounded-full">Current Plan</div>}
            <h3 className="text-xl font-bold text-gray-900 mb-1">Free</h3>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="text-3xl font-bold text-gray-900">₹0</span>
              <span className="text-gray-400 text-sm">/ month</span>
            </div>
            <ul className="space-y-3 mb-7">
              {FREE_FEATURES.map((f) => (
                <li key={f.name} className="flex items-center gap-3 text-sm">
                  {f.included === false ? (
                    <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  )}
                  <span className={f.included === false ? "text-gray-400" : "text-gray-700"}>{f.name}</span>
                  {f.value && <span className="ml-auto text-xs font-semibold text-gray-400">{f.value}</span>}
                </li>
              ))}
            </ul>
            {!isPro && (
              <div className="py-2.5 text-center text-sm font-semibold text-gray-400 bg-gray-50 rounded-xl">Your current plan</div>
            )}
          </div>

          {/* Pro Plan */}
          <div className={`care-plan care-plan-pro relative rounded-3xl border p-7 transition ${isPro ? "care-plan-current" : ""}`}>
            {isPro && <div className="absolute -top-3 left-6 px-3 py-0.5 bg-emerald-600 text-white text-xs font-bold rounded-full">Current Plan</div>}
            {!isPro && <div className="absolute -top-3 right-6 px-3 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">Recommended</div>}
            <h3 className="text-xl font-bold text-gray-900 mb-1">Pro</h3>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">₹199</span>
              <span className="text-gray-400 text-sm">/ month</span>
            </div>
            <ul className="space-y-3 mb-7">
              {PRO_FEATURES.map((f) => (
                <li key={f.name} className="flex items-center gap-3 text-sm">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-gray-700">{f.name}</span>
                  {f.value && <span className="ml-auto text-xs font-semibold text-emerald-600">{f.value}</span>}
                </li>
              ))}
            </ul>
            {isPro ? (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full py-2.5 text-center text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel Subscription"}
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={subscribing || !checkoutReady}
                className="care-pricing-cta w-full py-3 text-center text-sm font-bold rounded-xl transition disabled:opacity-50"
              >
                {subscribing ? "Processing..." : checkoutReady ? "Upgrade to Pro" : "Loading checkout..."}
              </button>
            )}
          </div>
        </div>

        {/* Usage (for free users) */}
        {billing && !isPro && (
          <div className="max-w-3xl mx-auto mt-10">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Your Usage This Month</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([
                { label: "Assessments", key: "assessments" as const },
                { label: "Lab Reports", key: "lab_reports" as const },
                { label: "Face Scans", key: "face_scans" as const },
                { label: "Image Analysis", key: "image_analyses" as const },
              ]).map(({ label, key }) => {
                const u = billing.usage[key];
                const pct = u.limit > 0 ? Math.min(100, (u.used / u.limit) * 100) : 0;
                const isAtLimit = u.limit > 0 && u.used >= u.limit;
                return (
                  <div key={key} className="care-usage-card rounded-xl border p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-lg font-bold ${isAtLimit ? "text-red-600" : "text-gray-900"}`}>
                      {u.used} / {u.limit}
                    </p>
                    <div className="care-usage-meter mt-2 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isAtLimit ? "bg-red-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FAQ */}
        <div className="max-w-2xl mx-auto mt-14">
          <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">Frequently Asked Questions</h3>
          <div className="space-y-4">
            {([
              { q: "What payment methods are accepted?", a: "UPI, credit/debit cards, net banking, and popular wallets via Razorpay." },
              { q: "Can I cancel anytime?", a: "Yes! Cancel anytime from this page. You'll keep Pro access until the end of your billing period." },
              { q: "What happens when my free limit is reached?", a: "You'll see an upgrade prompt. Your existing data is always accessible — only new assessments/uploads are limited." },
              { q: "Is my payment secure?", a: "Payments are processed by Razorpay (PCI-DSS Level 1 compliant). We never store your card details." },
            ]).map(({ q, a }) => (
              <div key={q} className="care-faq-card rounded-xl border p-5">
                <p className="text-sm font-semibold text-gray-900 mb-1">{q}</p>
                <p className="text-sm text-gray-500">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
