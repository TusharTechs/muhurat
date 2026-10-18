/**
 * Synthetic NEET-style question banks for demos. Written for this project; not taken from any real
 * paper. Each setter seals one section's bank; the paper draws a few questions from each at the bell.
 */
export type Question = { id: string; text: string; options: [string, string, string, string]; answer: 0 | 1 | 2 | 3 }
export type Bank = { exam: string; section: string; questions: Question[] }

const physics: Omit<Question, "id">[] = [
  { text: "A body starts from rest with uniform acceleration 2 m/s². The distance covered in the 5th second is", options: ["9 m", "10 m", "25 m", "8 m"], answer: 0 },
  { text: "The SI unit of electric flux is", options: ["N/C", "N·m²/C", "C/m²", "V/m"], answer: 1 },
  { text: "A block slides down a frictionless incline of 30°. Its acceleration is", options: ["g", "g/2", "g/√2", "√3g/2"], answer: 1 },
  { text: "Two resistors of 6 Ω and 3 Ω are connected in parallel. The equivalent resistance is", options: ["9 Ω", "4.5 Ω", "2 Ω", "18 Ω"], answer: 2 },
  { text: "The escape velocity from Earth is about 11.2 km/s. For a planet with twice Earth's radius and the same density, it is", options: ["5.6 km/s", "11.2 km/s", "22.4 km/s", "44.8 km/s"], answer: 2 },
  { text: "Light travels from glass (n = 1.5) into air. The critical angle is closest to", options: ["30°", "42°", "48°", "60°"], answer: 1 },
  { text: "The de Broglie wavelength of a particle is halved when its momentum is", options: ["halved", "doubled", "quadrupled", "unchanged"], answer: 1 },
  { text: "A transformer has 100 primary turns and 500 secondary turns. With 220 V AC input, the output is", options: ["44 V", "220 V", "1100 V", "500 V"], answer: 2 },
  { text: "The work done by a centripetal force on a body in uniform circular motion over one revolution is", options: ["positive", "negative", "zero", "depends on speed"], answer: 2 },
  { text: "The half-life of a radioactive sample is 10 days. The fraction remaining after 30 days is", options: ["1/3", "1/6", "1/8", "1/9"], answer: 2 },
  { text: "A capacitor of 2 μF is charged to 100 V. The energy stored is", options: ["0.01 J", "0.02 J", "0.1 J", "1 J"], answer: 0 },
  { text: "The dimensional formula of Planck's constant is", options: ["[ML²T⁻¹]", "[MLT⁻¹]", "[ML²T⁻²]", "[MT⁻¹]"], answer: 0 },
  { text: "A simple pendulum's length is made four times. Its time period becomes", options: ["half", "double", "four times", "unchanged"], answer: 1 },
  { text: "In Young's double-slit experiment, doubling the slit separation makes the fringe width", options: ["double", "half", "four times", "unchanged"], answer: 1 },
  { text: "The magnetic field at the centre of a circular loop of radius R carrying current I is", options: ["μ₀I/2R", "μ₀I/2πR", "μ₀I/4R", "μ₀IR/2"], answer: 0 },
]

const chemistry: Omit<Question, "id">[] = [
  { text: "The hybridisation of carbon in ethyne is", options: ["sp³", "sp²", "sp", "dsp²"], answer: 2 },
  { text: "The number of moles in 22 g of CO₂ is", options: ["0.25", "0.5", "1", "2"], answer: 1 },
  { text: "Which of these is the strongest acid?", options: ["CH₃COOH", "ClCH₂COOH", "Cl₂CHCOOH", "Cl₃CCOOH"], answer: 3 },
  { text: "The pH of a 0.001 M HCl solution is", options: ["1", "2", "3", "11"], answer: 2 },
  { text: "The shape of the SF₆ molecule is", options: ["tetrahedral", "trigonal bipyramidal", "octahedral", "square planar"], answer: 2 },
  { text: "The oxidation state of Cr in K₂Cr₂O₇ is", options: ["+3", "+6", "+7", "+2"], answer: 1 },
  { text: "Which gas is evolved when zinc reacts with dilute sulphuric acid?", options: ["O₂", "SO₂", "H₂", "H₂S"], answer: 2 },
  { text: "The IUPAC name of CH₃CH(OH)CH₃ is", options: ["propan-1-ol", "propan-2-ol", "2-methylethanol", "propanal"], answer: 1 },
  { text: "Which quantum number determines the shape of an orbital?", options: ["principal", "azimuthal", "magnetic", "spin"], answer: 1 },
  { text: "For an exothermic reaction at equilibrium, raising the temperature", options: ["shifts it forward", "shifts it backward", "has no effect", "doubles K"], answer: 1 },
  { text: "The number of unpaired electrons in Fe³⁺ is", options: ["3", "4", "5", "6"], answer: 2 },
  { text: "Benzene undergoes mainly which type of reaction?", options: ["electrophilic addition", "electrophilic substitution", "nucleophilic addition", "free-radical addition"], answer: 1 },
  { text: "The unit of the rate constant of a first-order reaction is", options: ["mol L⁻¹ s⁻¹", "L mol⁻¹ s⁻¹", "s⁻¹", "mol² L⁻² s⁻¹"], answer: 2 },
  { text: "Which of these is an example of a colligative property?", options: ["viscosity", "osmotic pressure", "surface tension", "refractive index"], answer: 1 },
  { text: "The most electronegative element is", options: ["oxygen", "chlorine", "fluorine", "nitrogen"], answer: 2 },
]

const biology: Omit<Question, "id">[] = [
  { text: "The powerhouse of the cell is the", options: ["nucleus", "ribosome", "mitochondrion", "Golgi body"], answer: 2 },
  { text: "Which blood group is the universal donor?", options: ["A", "B", "AB", "O"], answer: 3 },
  { text: "The site of photosynthesis's light reactions is the", options: ["stroma", "thylakoid membrane", "cytoplasm", "outer membrane"], answer: 1 },
  { text: "Crossing over occurs during", options: ["prophase I", "metaphase I", "anaphase II", "telophase II"], answer: 0 },
  { text: "Insulin is secreted by the", options: ["alpha cells", "beta cells", "delta cells", "acinar cells"], answer: 1 },
  { text: "The functional unit of the kidney is the", options: ["neuron", "nephron", "alveolus", "villus"], answer: 1 },
  { text: "Which vitamin deficiency causes scurvy?", options: ["Vitamin A", "Vitamin B₁", "Vitamin C", "Vitamin D"], answer: 2 },
  { text: "In a monohybrid cross, the F₂ phenotypic ratio is", options: ["1:1", "3:1", "9:3:3:1", "1:2:1"], answer: 1 },
  { text: "The enzyme that unwinds DNA during replication is", options: ["ligase", "helicase", "primase", "polymerase I"], answer: 1 },
  { text: "Which part of the brain controls balance and posture?", options: ["cerebrum", "cerebellum", "medulla", "hypothalamus"], answer: 1 },
  { text: "Nitrogen fixation in legume root nodules is carried out by", options: ["Rhizobium", "Nitrosomonas", "Azotobacter", "Nitrobacter"], answer: 0 },
  { text: "The number of chromosomes in a human gamete is", options: ["23", "46", "22", "44"], answer: 0 },
  { text: "Which tissue transports water in plants?", options: ["phloem", "xylem", "cambium", "cortex"], answer: 1 },
  { text: "Antibodies are produced by", options: ["T cells", "plasma cells", "macrophages", "platelets"], answer: 1 },
  { text: "The pacemaker of the human heart is the", options: ["AV node", "SA node", "bundle of His", "Purkinje fibres"], answer: 1 },
]

export const SECTIONS = { physics, chemistry, biology } as const
export type Section = keyof typeof SECTIONS

export function bankFor(exam: string, section: Section): Bank {
  return {
    exam,
    section,
    questions: SECTIONS[section].map((q, i) => ({ ...q, id: `${section.slice(0, 3)}-${String(i + 1).padStart(2, "0")}` })),
  }
}
