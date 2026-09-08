import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
