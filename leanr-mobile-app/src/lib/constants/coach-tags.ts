// Mirrors web's src/lib/constants/coach-tags.ts exactly — shared vocabulary
// used by the admin "Add Coach"/"Edit Coach" forms so specialization/skill/
// language values stay canonical across platforms (matching/filtering logic
// elsewhere assumes these exact strings, not freeform admin-typed text).

export const COACH_SKILLS = [
  'Rehab',
  'Posture Correction',
  'Weight Loss',
  'Strength Training',
  'Mobility',
  'Sports Performance',
  'Prenatal & Postnatal',
  'Senior Fitness',
  'Injury Recovery',
  'Flexibility & Stretching',
  'Nutrition Coaching',
  'Cardio Conditioning',
] as const;

export const COACH_LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Bengali', 'Punjabi'] as const;
