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
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  useEffect(() => {
    getBillingStatus()
      .then(setBilling)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isPro = billing?.plan === "pro" && billing?.status === "active";

  async function handleSubscribe() {
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
      setMessage({ type: "success", text: "Subscription cancelled. You'll retain Pro access until the end of your billing period." });
      const updated = await getBillingStatus();
      setBilling(updated);
    } catch {
      setMessage({ type: "error", text: "Failed to cancel. Please try again." });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="min-h-screen warm-bg">
      {/* Header */}
      <header className="warm-header sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            <span className="text-sm font-medium">Back</span>
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">MedSign Pro</h1>
          <div className="w-16" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold mb-4">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            Upgrade your health intelligence
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Choose Your Plan</h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">Get unlimited AI-powered health assessments, lab reports, and more with MedSign Pro.</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`max-w-lg mx-auto mb-8 px-5 py-3 rounded-xl text-sm font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.text}
          </div>
        )}

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free Plan */}
          <div className={`relative rounded-2xl border-2 p-7 transition ${!isPro ? "border-emerald-300 bg-white shadow-lg" : "border-gray-200 bg-white/60"}`}>
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
          <div className={`relative rounded-2xl border-2 p-7 transition ${isPro ? "border-emerald-300 bg-white shadow-lg" : "border-gray-200 bg-gradient-to-br from-emerald-50/50 to-teal-50/30"}`}>
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
                disabled={subscribing}
                className="w-full py-3 text-center text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl hover:shadow-lg hover:shadow-emerald-200/50 transition disabled:opacity-50"
              >
                {subscribing ? "Processing..." : "Upgrade to Pro"}
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
                  <div key={key} className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-lg font-bold ${isAtLimit ? "text-red-600" : "text-gray-900"}`}>
                      {u.used} / {u.limit}
                    </p>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
              <div key={q} className="bg-white rounded-xl border border-gray-100 p-5">
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
