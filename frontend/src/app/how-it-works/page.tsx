import type { Metadata } from "next";
import MarketingPage from "@/components/MarketingPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "How MedSign Works",
  description:
    "See how MedSign helps organize health questions, lab reports, symptoms, and medication context for clearer clinician conversations.",
  path: "/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <MarketingPage
      path="/how-it-works"
      eyebrow="How MedSign works"
      title="Turn scattered health details into a clearer next conversation"
      intro="MedSign is an AI health companion that helps you collect the health context you already have—questions, symptoms, reports, and medication information—and make it easier to discuss with a qualified clinician."
      highlights={[
        "Start with the format that is easiest: describe, upload, or track.",
        "Organize context and questions in one private care space.",
        "Use the result to make a more prepared next decision with a clinician.",
      ]}
      sections={[
        {
          title: "1. Share the health context you want to organize",
          body: [
            "You can begin with a question, a symptom timeline, a lab report, or the medicine information you already have. MedSign is built to make the first step feel accessible even when you do not know the right medical vocabulary.",
            "Only share information that is relevant to your goal and that you are comfortable including in your care space.",
          ],
        },
        {
          title: "2. Review plain-language organization and prompts",
          body: [
            "MedSign brings the information into a more readable view and can help surface follow-up questions for a healthcare conversation. It is not a substitute for a clinical assessment or medical diagnosis.",
            "When a concern needs in-person, urgent, or emergency care, the right next step is professional care—not more time in an app.",
          ],
        },
        {
          title: "3. Take better context into your next care decision",
          body: [
            "Use your organized notes when speaking with a doctor or another qualified healthcare professional. Medication, dose, treatment, and prescription decisions should be verified with an appropriately qualified practitioner.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Does MedSign replace a doctor?",
          answer: "No. It helps you organize health context and prepare for professional care. Diagnosis and treatment decisions belong to qualified clinicians.",
        },
        {
          question: "Can I use MedSign for family health information?",
          answer: "MedSign can help keep relevant health context organized. Always make sure you have permission before adding or sharing another person's health information.",
        },
        {
          question: "Is MedSign free to start?",
          answer: "You can create an account and explore the current early-access experience without a subscription limit. Always verify health and medication decisions with a qualified healthcare professional.",
        },
      ]}
      relatedLinks={[
        { href: "/ai-lab-report-analyzer", label: "Lab report analyzer", description: "Understand what to ask about a report before your appointment." },
        { href: "/ai-symptom-checker", label: "Symptom checker", description: "Capture the timeline and details that matter." },
        { href: "/online-prescription", label: "Prescription guidance", description: "Review the medication safety boundary before acting on AI output." },
      ]}
    />
  );
}
