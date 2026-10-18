/** A synthetic question bank, larger than one paper needs. No real exam content. */
export function sampleBank(exam: string, section: string, questions: number) {
  return {
    exam,
    section,
    questions: Array.from({ length: questions }, (_, i) => ({
      id: `${section.slice(0, 3)}-${i + 1}`,
      text: `Synthetic question ${i + 1}: a block of mass ${i + 2} kg slides down a frictionless incline of 30 degrees. Find its acceleration.`,
      options: ["g/2", "g", "g/3", "2g"],
      answer: 0,
    })),
  }
}
