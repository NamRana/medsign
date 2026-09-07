"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import BrandLogo from "@/components/BrandLogo";
import { apiFetch } from "@/lib/api";

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "India",
  "Asia/Calcutta": "India",
  "Asia/Mumbai": "India",
  "America/New_York": "United States",
  "America/Chicago": "United States",
  "America/Denver": "United States",
  "America/Los_Angeles": "United States",
  "America/Phoenix": "United States",
  "America/Anchorage": "United States",
  "Pacific/Honolulu": "United States",
  "Europe/London": "United Kingdom",
  "Asia/Dubai": "UAE",
  "America/Toronto": "Canada",
  "America/Vancouver": "Canada",
  "Australia/Sydney": "Australia",
  "Australia/Melbourne": "Australia",
  "Australia/Perth": "Australia",
  "Europe/Berlin": "Germany",
  "Asia/Riyadh": "Saudi Arabia",
  "Asia/Singapore": "Singapore",
  "Asia/Dhaka": "Bangladesh",
  "Asia/Kathmandu": "Nepal",
  "Asia/Colombo": "Sri Lanka",
  "Asia/Karachi": "Pakistan",
  "Africa/Lagos": "Nigeria",
  "Africa/Johannesburg": "South Africa",
  "Asia/Manila": "Philippines",
  "Asia/Jakarta": "Indonesia",
  "Asia/Kuala_Lumpur": "Malaysia",
  "Africa/Nairobi": "Kenya",
};

function detectCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_TO_COUNTRY[tz] || "";
  } catch {
    return "";
  }
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Very weak", color: "bg-red-500" };
  if (score === 2) return { score, label: "Weak", color: "bg-orange-500" };
  if (score === 3) return { score, label: "Fair", color: "bg-yellow-500" };
  if (score === 4) return { score, label: "Strong", color: "bg-emerald-400" };
  return { score, label: "Very strong", color: "bg-emerald-600" };
}

const NAME_REGEX = /^[A-Za-z\s'-]+$/;

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const detected = detectCountry();
      if (detected) setCountry(detected);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const maxDate = new Date().toISOString().split("T")[0];
  const strength = getPasswordStrength(password);

  function validateField(name: string, value: string): string {
    switch (name) {
      case "firstName":
      case "lastName": {
        const label = name === "firstName" ? "First name" : "Last name";
        if (!value.trim()) return `${label} is required`;
        if (value.trim().length < 2) return `${label} must be at least 2 characters`;
        if (!NAME_REGEX.test(value.trim())) return `${label} can only contain letters, spaces, hyphens, and apostrophes`;
        return "";
      }
      case "email": {
        if (!value.trim()) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Enter a valid email address";
        return "";
      }
      case "password": {
        if (!value) return "Password is required";
        if (value.length < 8) return "Must be at least 8 characters";
        if (!/[A-Z]/.test(value)) return "Must include an uppercase letter";
        if (!/[a-z]/.test(value)) return "Must include a lowercase letter";
        if (!/[0-9]/.test(value)) return "Must include a number";
        if (!/[^A-Za-z0-9]/.test(value)) return "Must include a special character (!@#$...)";
        return "";
      }
      case "confirmPassword": {
        if (!value) return "Please confirm your password";
        if (value !== password) return "Passwords do not match";
        return "";
      }
      case "dob": {
        if (!value) return "Date of birth is required";
        if (calculateAge(value) < 15) return "You must be at least 15 years old";
        if (calculateAge(value) > 120) return "Please enter a valid date of birth";
        return "";
      }
      case "gender":
        if (!value) return "Please select your gender";
        return "";
      case "country":
        if (!value) return "Please select your country";
        return "";
      default:
        return "";
    }
  }

  function handleBlur(name: string, value: string) {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const err = validateField(name, value);
    setFieldErrors((prev) => ({ ...prev, [name]: err }));
  }

  function validateAll(): boolean {
    const fields: Record<string, string> = { firstName, lastName, email, password, confirmPassword, dob, gender, country };
    const errors: Record<string, string> = {};
    let valid = true;
    for (const [name, value] of Object.entries(fields)) {
      const err = validateField(name, value);
      if (err) { errors[name] = err; valid = false; }
    }
    setFieldErrors(errors);
    setTouched(Object.fromEntries(Object.keys(fields).map((k) => [k, true])));
    return valid;
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) setError(oauthError.message);
    } catch {
      setError("Could not connect to Google. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!validateAll()) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user && !data.session) {
      setConfirmationSent(true);
      setLoading(false);
      return;
    }

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      await apiFetch("/api/v1/patients", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName || null,
          date_of_birth: dob || null,
          gender: gender || null,
          location_country: country || null,
        }),
      });
    } catch {
      // Non-fatal — profile can be completed later
    }

    router.replace("/dashboard");
    router.refresh();
  }

  if (confirmationSent) {
    return (
      <div className="care-auth-shell items-center justify-center px-4">
        <div className="care-auth-confirmation max-w-sm w-full text-center rounded-3xl p-8">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900">Check your email</h2>
          <p className="text-sm text-gray-500 mt-2">
            We sent a confirmation link to <span className="font-semibold text-gray-700">{email}</span>.
            Click the link to activate your account.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors">
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="care-auth-shell">
      {/* Left decorative panel */}
      <div className="care-auth-side hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative text-white text-center max-w-md">
          <span className="care-live mb-5">Your private health command center</span>
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-4">Start your health journey</h2>
          <p className="text-teal-100 text-base leading-relaxed">
            Join thousands of people using AI to understand their health better. Free assessments, multilingual support, and instant insights.
          </p>
          <div className="mt-8 space-y-3 text-left max-w-xs mx-auto">
            {[
              "AI-powered symptom assessment",
              "Lab report analysis in seconds",
              "Health insights and tracking",
              "Doctor-ready summaries",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm text-teal-50">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="care-auth-content flex-1 flex items-center justify-center px-4 py-12">
        <div className="care-auth-form w-full max-w-md space-y-6">
          <div className="text-center">
            <BrandLogo className="justify-center mb-4 lg:hidden" />
            <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="mt-2 text-sm text-gray-500">Free to use. No credit card needed.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={googleLoading || loading}
            className="care-auth-provider w-full flex items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {googleLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Sign up with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white/90 px-3 text-gray-400">or sign up with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  First name <span className="text-red-400">*</span>
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); if (touched.firstName) handleBlur("firstName", e.target.value); }}
                  onBlur={() => handleBlur("firstName", firstName)}
                  className={`block w-full rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${touched.firstName && fieldErrors.firstName ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                  placeholder="First name"
                />
                {touched.firstName && fieldErrors.firstName && <p className="mt-1 text-xs text-red-500">{fieldErrors.firstName}</p>}
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Last name <span className="text-red-400">*</span>
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); if (touched.lastName) handleBlur("lastName", e.target.value); }}
                  onBlur={() => handleBlur("lastName", lastName)}
                  className={`block w-full rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${touched.lastName && fieldErrors.lastName ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                  placeholder="Last name"
                />
                {touched.lastName && fieldErrors.lastName && <p className="mt-1 text-xs text-red-500">{fieldErrors.lastName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="dob" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Date of birth <span className="text-red-400">*</span>
                </label>
                <input
                  id="dob"
                  type="date"
                  max={maxDate}
                  value={dob}
                  onChange={(e) => { setDob(e.target.value); if (touched.dob) handleBlur("dob", e.target.value); }}
                  onBlur={() => handleBlur("dob", dob)}
                  className={`block w-full rounded-xl border px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all ${touched.dob && fieldErrors.dob ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                />
                {touched.dob && fieldErrors.dob && <p className="mt-1 text-xs text-red-500">{fieldErrors.dob}</p>}
                {dob && !fieldErrors.dob && (
                  <p className="mt-1 text-xs text-gray-500">Age: <span className="font-semibold text-gray-700">{calculateAge(dob)} years</span></p>
                )}
              </div>
              <div>
                <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Gender <span className="text-red-400">*</span>
                </label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => { setGender(e.target.value); if (touched.gender) handleBlur("gender", e.target.value); }}
                  onBlur={() => handleBlur("gender", gender)}
                  className={`block w-full rounded-xl border px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all bg-white ${touched.gender && fieldErrors.gender ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                >
                  <option value="" disabled>Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                {touched.gender && fieldErrors.gender && <p className="mt-1 text-xs text-red-500">{fieldErrors.gender}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1.5">
                Where will you visit a pharmacy? <span className="text-red-400">*</span>
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => { setCountry(e.target.value); if (touched.country) handleBlur("country", e.target.value); }}
                onBlur={() => handleBlur("country", country)}
                className={`block w-full rounded-xl border px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all bg-white ${touched.country && fieldErrors.country ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
              >
                <option value="" disabled>Select your country</option>
                <option value="India">India</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="UAE">UAE</option>
                <option value="Canada">Canada</option>
                <option value="Australia">Australia</option>
                <option value="Germany">Germany</option>
                <option value="Saudi Arabia">Saudi Arabia</option>
                <option value="Singapore">Singapore</option>
                <option value="Bangladesh">Bangladesh</option>
                <option value="Nepal">Nepal</option>
                <option value="Sri Lanka">Sri Lanka</option>
                <option value="Pakistan">Pakistan</option>
                <option value="Nigeria">Nigeria</option>
                <option value="South Africa">South Africa</option>
                <option value="Philippines">Philippines</option>
                <option value="Indonesia">Indonesia</option>
                <option value="Malaysia">Malaysia</option>
                <option value="Kenya">Kenya</option>
                <option value="Other">Other</option>
              </select>
              {touched.country && fieldErrors.country && <p className="mt-1 text-xs text-red-500">{fieldErrors.country}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address <span className="text-red-400">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (touched.email) handleBlur("email", e.target.value); }}
                onBlur={() => handleBlur("email", email)}
                className={`block w-full rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${touched.email && fieldErrors.email ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                placeholder="you@example.com"
              />
              {touched.email && fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (touched.password) handleBlur("password", e.target.value); }}
                  onBlur={() => handleBlur("password", password)}
                  className={`block w-full rounded-xl border px-4 py-3 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${touched.password && fieldErrors.password ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                  placeholder="Min 8 chars, upper, lower, number, symbol"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength.score ? strength.color : "bg-gray-200"}`} />
                    ))}
                  </div>
                  <p className={`text-xs mt-1 ${strength.score <= 2 ? "text-red-500" : strength.score <= 3 ? "text-yellow-600" : "text-emerald-600"}`}>
                    {strength.label}
                  </p>
                </div>
              )}
              {touched.password && fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
              {!touched.password && !password && (
                <ul className="mt-1.5 text-[11px] text-gray-400 space-y-0.5">
                  <li>At least 8 characters with uppercase, lowercase, number, and symbol</li>
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm password <span className="text-red-400">*</span>
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); if (touched.confirmPassword) handleBlur("confirmPassword", e.target.value); }}
                onBlur={() => handleBlur("confirmPassword", confirmPassword)}
                className={`block w-full rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${touched.confirmPassword && fieldErrors.confirmPassword ? "border-red-300 focus:border-red-400 focus:ring-red-200" : confirmPassword && confirmPassword === password ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20" : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                placeholder="Re-enter your password"
              />
              {touched.confirmPassword && fieldErrors.confirmPassword && <p className="mt-1 text-xs text-red-500">{fieldErrors.confirmPassword}</p>}
              {confirmPassword && confirmPassword === password && !fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  Passwords match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="care-auth-primary w-full rounded-xl px-4 py-3 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors">
              Sign in
            </Link>
          </p>

          <p className="text-center text-sm text-gray-400">
            <Link href="/" className="hover:text-emerald-600 transition-colors">
              ← Back to home
            </Link>
          </p>

          <p className="text-center text-[11px] text-gray-400 max-w-xs mx-auto">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
            MedSign is not a substitute for professional medical advice.
          </p>
        </div>
      </div>
    </div>
  );
}

function calculateAge(dobStr: string): number {
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
