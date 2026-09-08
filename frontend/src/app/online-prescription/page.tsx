import type { Metadata } from "next";
import MarketingPage from "@/components/MarketingPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "AI Prescription Guidance",
  description:
    "Organize symptom and medication context with AI-generated prescription guidance, then verify medicine and dose decisions with a qualified practitioner.",
  path: "/online-prescription",
});

export default function OnlinePrescriptionPage() {
  return (
    <MarketingPage
      path="/online-prescription"
      eyebrow="AI prescription guidance"
      title="AI prescription guidance for clearer medication conversations"
      intro="MedSign can organize symptoms, existing medicines, and health context and may generate AI symptom assessments and medicine-related guidance. That output is not a substitute for an appropriately qualified practitioner's diagnosis, treatment plan, or prescription."
      highlights={[
        "Bring symptoms, current medicines, and relevant report context into one place.",
        "Use AI-generated information to prepare questions, not as the final medication decision.",
        "Verify medicine, dose, interactions, and prescriptions with an appropriately qualified practitioner.",
      ]}
      sections={[
        {
          title: "How AI prescription guidance should be used",
          body: [
            "MedSign can turn the health context you share into a more organized starting point for a medication conversation. It can help you remember current medicines, capture symptoms, and prepare questions to discuss with a qualified practitioner.",
            "AI-generated medicine or prescription guidance can be incomplete, wrong, or unsuitable for an individual. Never start, stop, substitute, or change a medicine or dose based only on an AI response.",
          ],
        },
        {
          title: "Allopathic and homeopathic medicines both need appropriate review",
          body: [
            "Whether you are considering allopathic or homeopathic care, medicine selection and dosing depend on the person's history, symptoms, other medicines, allergies, examination, and local requirements. That assessment needs an appropriately qualified practitioner.",
            "Keep the original prescription and medicine packaging available for the review. If you have a reaction, severe symptom, or concern about a medicine, seek prompt in-person professional care.",
          ],
        },
        {
          title: "Use clear search language without overpromising",
          body: [
            "People may search for terms such as \"AI doctor\", \"AI prescription\", or \"online prescription\". MedSign uses those topics to help people understand and organize health context, while being clear that AI output must be verified before medicine decisions are made.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Can I use AI prescription guidance as a prescription?",
          answer: "No. Treat it as information to discuss with an appropriately qualified practitioner. Do not start, stop, or change a medicine or dose based only on AI-generated output.",
        },
        {
          question: "Does this apply to allopathic and homeopathic medicines?",
          answer: "Yes. Any medicine, dose, or treatment decision needs appropriate professional review for the individual situation.",
        },
        {
          question: "What if I have a bad reaction or urgent symptoms?",
          answer: "Seek urgent in-person or emergency care immediately. Do not wait for an online response or use an app as emergency care.",
        },
      ]}
      relatedLinks={[
        { href: "/ai-symptom-checker", label: "Symptom guidance", description: "Organize symptom details before a professional conversation." },
        { href: "/ai-lab-report-analyzer", label: "Lab report analyzer", description: "Put report questions into plain-language context." },
        { href: "/medical-safety", label: "Medical safety", description: "Understand where AI guidance should stop." },
      ]}
    />
  );
}
