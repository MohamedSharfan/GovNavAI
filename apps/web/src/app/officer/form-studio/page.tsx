import type { Metadata } from "next";
import { FormStudio } from "./form-studio";

export const metadata: Metadata = { title: "Form Studio", robots: { index: false } };

export default function FormStudioPage() {
  return <FormStudio />;
}
