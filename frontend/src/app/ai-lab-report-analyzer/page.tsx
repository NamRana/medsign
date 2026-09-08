import type { Metadata } from "next";
import MarketingPage from "@/components/MarketingPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "AI Lab Report Analyzer",
  description:
    "Upload a blood test or lab report to organize values, understand plain-language context, and prepare questions for your clinician.",
  path: "/ai-lab-report-analyzer",
});

export default function AiLabReportAnalyzerPage() {
  return (
    <MarketingPage
      path="/ai-lab-report-analyzer"
      eyebrow="AI lab report analyzer"
      title="Understand your lab report before your next clinician visit"
      intro="MedSign helps you turn a blood test or lab report into an organized, plain-language summary so you can have a more prepared conversation with a qualified healthcare professional."
      highlights={[
        "Bring report values and questions into one readable place.",
        "See AI-generated flags based on the reference ranges in your report.",
        "Create a clearer starting point for a clinician conversation.",
      ]}
      sections={[
        {
          title: "A clearer way to look at blood test results",
          body: [
            "Medical reports often contain abbreviations, reference ranges, and a long list of numbers without much explanation. MedSign helps organize the information you share and puts it into language that is easier to discuss.",
            "It can flag values against the reference ranges shown in your report and help you understand the topics to ask about in a CBC, thyroid, HbA1c, lipid profile, liver, kidney, or other lab report. A qualified clinician remains the right person to interpret results alongside your medical history, examination, and symptoms.",
          ],
        },
        {
          title: "How to use MedSign with a lab report",
          body: [
            "Upload the report you have, review the organized context, and note the questions you want to take to your appointment. Add relevant symptoms, medicines, or changes you have noticed only when you are comfortable sharing them.",
            "A single lab value rarely tells the whole story. AI-generated flags and recommendations based on report ranges need qualified clinical interpretation, especially if a result is abnormal or you feel unwell.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Can an AI lab report analyzer diagnose a condition?",
          answer: "It can flag report values and generate interpretations based on the information provided, but it cannot establish a diagnosis for an individual. A qualified clinician should interpret results with your history, symptoms, and other clinical information.",
        },
        {
          question: "Which reports can I discuss with MedSign?",
          answer: "You can use it to organize questions from the reports you have. Common examples include blood tests, CBC, thyroid, HbA1c, lipid, liver, and kidney reports.",
        },
        {
          question: "What should I do about a worrying result?",
          answer: "Contact a qualified healthcare professional promptly. If you feel severely unwell or have urgent symptoms, seek emergency or urgent in-person care rather than relying on an app.",
        },
      ]}
      relatedLinks={[
        { href: "/ai-symptom-checker", label: "Symptom guidance", description: "Organize symptoms and the key details for your next care conversation." },
        { href: "/online-prescription", label: "Prescription guidance", description: "Keep medicine context clear and verify it with a qualified practitioner." },
        { href: "/how-it-works", label: "How MedSign works", description: "Learn how your inputs become more useful health context." },
      ]}
    />
  );
}
