import type { Metadata } from "next";
import MarketingPage from "@/components/MarketingPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "AI Symptom Checker",
  description:
    "Describe symptoms in your own words, receive an AI-generated symptom assessment, and prepare for qualified professional review.",
  path: "/ai-symptom-checker",
});

export default function AiSymptomCheckerPage() {
  return (
    <MarketingPage
      path="/ai-symptom-checker"
      eyebrow="AI symptom checker"
      title="Organize symptoms before you speak to a clinician"
      intro="Use MedSign to describe what has changed, capture the timeline, and receive an AI-generated symptom assessment that can help make a healthcare conversation more useful. Review important health decisions with an appropriately qualified practitioner."
      highlights={[
        "Describe symptoms in everyday language, without medical jargon.",
        "Keep the timeline, relevant context, and follow-up questions together.",
        "Recognize when an app is not the right place to wait for help.",
      ]}
      sections={[
        {
          title: "A symptom checker should help you prepare, not replace care",
          body: [
            "When something changes, it can be difficult to remember when it began, how it has changed, and what else may be relevant. MedSign uses the details you provide to generate an AI symptom assessment and organize them before a doctor or clinician visit.",
            "The assessment may identify possible conditions and next steps, but it cannot rule out serious illness or replace an examination. The goal is a clearer, calmer starting point for appropriate professional care.",
          ],
        },
        {
          title: "What to include when describing a symptom",
          body: [
            "Useful context can include when the symptom started, how it is changing, what makes it better or worse, relevant medicines, and any recent report results. Share only what is relevant and comfortable for you.",
            "If symptoms are sudden, severe, rapidly worsening, or make you feel unsafe, seek urgent in-person or emergency help. Do not wait for online guidance.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Is MedSign an AI doctor?",
          answer: "MedSign uses AI to generate symptom assessments and health information. It is not a substitute for a licensed clinician, so do not use it as the sole basis for a diagnosis, treatment, or prescription decision.",
        },
        {
          question: "Can I use it before an appointment?",
          answer: "Yes. It can help you capture a symptom timeline and questions so the clinician has a clearer starting point for the conversation.",
        },
        {
          question: "When should I get urgent help?",
          answer: "For severe, sudden, worsening, or potentially life-threatening symptoms, seek urgent in-person or emergency care immediately. Do not rely on an online symptom tool in an emergency.",
        },
      ]}
      relatedLinks={[
        { href: "/ai-lab-report-analyzer", label: "Lab report analyzer", description: "Bring report values into plain-language context before your next visit." },
        { href: "/online-prescription", label: "Prescription guidance", description: "Organize medication context, then verify it with a qualified practitioner." },
        { href: "/how-it-works", label: "How MedSign works", description: "See how health inputs become more organized context." },
      ]}
    />
  );
}
