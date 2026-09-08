import type { Metadata } from "next";
import MarketingPage from "@/components/MarketingPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Medical Safety",
  description:
    "Learn what MedSign can help with, where AI guidance stops, and when to seek a licensed clinician or emergency care.",
  path: "/medical-safety",
});

export default function MedicalSafetyPage() {
  return (
    <MarketingPage
      path="/medical-safety"
      eyebrow="Medical safety"
      title="Clear boundaries are part of responsible health guidance"
      intro="MedSign is designed to help organize health information and prepare for care conversations. AI-generated information does not replace a medical diagnosis, emergency services, or an appropriately qualified practitioner's judgment."
      highlights={[
        "AI-generated assessments and recommendations need qualified professional review.",
        "Medication and prescription decisions need qualified professional review.",
        "Urgent or emergency symptoms need urgent in-person help.",
      ]}
      sections={[
        {
          title: "What MedSign can help you do",
          body: [
            "MedSign can help you organize symptoms, lab reports, medication context, and questions for a clinician. The product is intended to make health information more understandable and care conversations more prepared.",
            "It can also make it easier to keep context together over time, especially when you want a clearer record of what changed and what you want to ask next.",
          ],
        },
        {
          title: "Limits of AI-generated health information",
          body: [
            "MedSign may generate symptom assessments, possible conditions, report interpretations, and recommendations from the information you share. That information can be incomplete, wrong, or unsuitable for a particular person or situation, and it cannot rule out serious illness or replace a qualified healthcare professional's examination and judgment.",
            "Do not rely on AI-generated information as the sole basis for allopathic or homeopathic medicine, dose, treatment, or prescription decisions. Verify those decisions with an appropriately qualified practitioner.",
          ],
        },
        {
          title: "When to seek urgent or emergency care",
          body: [
            "If you have severe, sudden, rapidly worsening, or potentially life-threatening symptoms, seek urgent in-person or emergency care immediately. Do not wait for an app response or online consultation.",
            "If you are unsure whether a situation is urgent, choose the safer option and contact a local healthcare professional or emergency service.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Can I rely on MedSign for an emergency?",
          answer: "No. For urgent or potentially life-threatening symptoms, contact local emergency services or seek immediate in-person care.",
        },
        {
          question: "Who makes prescription decisions?",
          answer: "Prescription decisions should be made or verified by an appropriately qualified practitioner who can assess the individual situation and applicable local requirements.",
        },
        {
          question: "What should I do with information from MedSign?",
          answer: "Use it to prepare questions and context for a qualified healthcare professional, who can assess your individual situation.",
        },
      ]}
      relatedLinks={[
        { href: "/how-it-works", label: "How MedSign works", description: "See how the product turns inputs into organized health context." },
        { href: "/ai-symptom-checker", label: "Symptom guidance", description: "Prepare symptom details for a care conversation." },
        { href: "/online-prescription", label: "Prescription guidance", description: "Learn the safety boundary for medicine-related AI output." },
      ]}
    />
  );
}
