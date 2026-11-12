// Approved knowledge for WellBridge AI Support (used only by the Claude provider).
//
// Product decision B4: approved WellBridge content only. Every item below is
// copied from content the app already shows, with its source file. Deliberately
// EXCLUDED because it is pending clinical review or still needs approval:
//   - symptom cautions and tips in services/assistant/mockAssistant.js
//     (SYMPTOM_CAUTION, WATCH_TIP, RETURN_TIP, DIZZY_TIP, SYMPTOM_TIP);
//   - the sleep-duration claim in frontend/src/compnents/quiz/quizEngine.js;
//   - the safety placeholders in safety.js and communityContent.js (these are
//     sent only by the safety pathway, never used as advice);
//   - any helpline numbers (none are approved).
// No user records (journals, moods, profiles, community posts) are ever included.
//
// The frontend files cannot be imported here (separate package; exerciseData.js
// imports images), so this is a curated copy. assistant.provider.offline-check.mjs
// checks that the exercise ids still match exerciseData.js. Bump DIGEST_VERSION
// whenever this content changes (no long digit runs: the text is sent to the
// model, and the output guard treats 9+ digits as a phone number).

export const DIGEST_VERSION = 'wb-digest-v1';

const STOP_NOTE = 'Stop if you feel pain, dizziness or discomfort.';

// Source: frontend/src/compnents/meditation/exerciseData.js (GENERAL_NOTICE)
const EXERCISE_NOTICE = 'These are general wellbeing exercises, not medical advice. Go at your own pace. '
  + 'Stop if you feel pain, dizziness or discomfort. If you have an injury or health condition, '
  + 'or are pregnant, check with a health professional before trying a new exercise.';

// Source: frontend/src/compnents/meditation/exerciseData.js (EXERCISES)
export const EXERCISES = [
  {
    id: 'neck-side-stretch', name: 'Gentle neck side stretch', category: 'Stretching', minutes: 3,
    description: 'A slow, seated stretch for the sides of the neck.',
    steps: ['Sit tall with your feet flat on the floor and your shoulders relaxed.',
      'Slowly tilt your right ear towards your right shoulder until you feel a gentle stretch on the left side of your neck. Keep your shoulders down.',
      'Hold for 15 to 20 seconds while breathing normally.', 'Slowly bring your head back to the centre.', 'Repeat on the left side.'],
    guidance: '2 to 3 times on each side.',
    safety: [STOP_NOTE, 'Move slowly and do not bounce.', 'Do not roll your head in full circles.', 'Stop if you feel tingling or numbness in your arms.'],
  },
  {
    id: 'wall-calf-stretch', name: 'Wall calf stretch', category: 'Stretching', minutes: 4,
    description: 'A standing stretch for the back of the lower legs, using a wall for support.',
    steps: ['Stand facing a wall, about an arm’s length away, and place your hands on the wall at shoulder height.',
      'Step your right foot back. Keep the right heel on the floor and the toes pointing forward.',
      'Bend your front knee slightly and lean forward until you feel a gentle stretch in the back of your right lower leg.',
      'Hold for 20 to 30 seconds while breathing normally.', 'Step back to standing and repeat with the left leg.'],
    guidance: '2 times on each leg.',
    safety: [STOP_NOTE, 'Keep the stretch gentle; you should feel a pull, not pain.', 'Keep your hands on the wall for balance throughout.'],
  },
  {
    id: 'childs-pose', name: 'Child’s pose', category: 'Yoga', minutes: 3,
    description: 'A resting yoga pose with the body folded forward over the knees.',
    steps: ['Kneel on your mat with your big toes touching and your knees as wide apart as is comfortable.',
      'Slowly sit your hips back towards your heels.',
      'Walk your hands forward and lower your chest. Rest your forehead on the mat or on a cushion.',
      'Breathe slowly for 5 to 10 breaths.', 'To come up, walk your hands back towards your knees and slowly lift your body.'],
    guidance: 'Hold for 5 to 10 slow breaths. Repeat once or twice if it feels good.',
    safety: [STOP_NOTE, 'If your knees feel uncomfortable, place a folded blanket under them or behind your knees, or skip this pose.', 'Come up slowly to avoid feeling lightheaded.'],
  },
  {
    id: 'cat-cow', name: 'Cat–cow', category: 'Yoga', minutes: 3,
    description: 'A slow movement between rounding and gently arching the back on hands and knees.',
    steps: ['Come onto your hands and knees, with your wrists under your shoulders and your knees under your hips.',
      'Breathe in. Let your belly lower gently and lift your chest, looking slightly forward.',
      'Breathe out. Round your back towards the ceiling and let your chin move towards your chest.',
      'Keep moving slowly between the two positions in time with your breath.', 'Finish in a flat-back position and rest.'],
    guidance: '5 to 8 slow rounds.',
    safety: [STOP_NOTE, 'Keep the movement small and comfortable, especially in the neck and lower back.', 'If your wrists feel uncomfortable, try resting on your forearms instead.'],
  },
  {
    id: 'box-breathing', name: 'Box breathing', category: 'Breathing Exercises', minutes: 4,
    description: 'Breathing in, holding, breathing out and holding again, each for an equal count.',
    steps: ['Sit comfortably with your back supported and your shoulders relaxed.', 'Breathe in gently through your nose for a count of 4.',
      'Hold your breath gently for a count of 4.', 'Breathe out slowly for a count of 4.', 'Hold gently for a count of 4, then start the next round.'],
    guidance: '4 to 6 rounds. If a count of 4 feels too long, use a count of 3.',
    safety: [STOP_NOTE, 'Never strain or force your breath.', 'If you feel lightheaded, stop and return to normal breathing.', 'You can leave out the holds if they feel uncomfortable.'],
  },
  {
    id: 'belly-breathing', name: 'Belly breathing', category: 'Breathing Exercises', minutes: 5,
    description: 'Slow breathing that lets the belly rise and fall.',
    steps: ['Sit or lie down comfortably. Place one hand on your chest and the other on your belly.',
      'Breathe in slowly through your nose and let your belly rise under your hand.', 'Breathe out slowly and let your belly fall.',
      'Try to keep the hand on your chest fairly still.', 'Continue at a slow pace that feels comfortable.'],
    guidance: 'About 5 minutes, or 10 slow breaths.',
    safety: [STOP_NOTE, 'Breathe at a pace that feels natural; do not force deep breaths.', 'If you feel lightheaded, stop and return to normal breathing.'],
  },
  {
    id: 'marching-on-the-spot', name: 'Marching on the spot', category: 'Physical Activity', minutes: 5,
    description: 'Gentle marching in place to get moving, with a chair nearby for balance.',
    steps: ['Stand tall in a clear space. Hold the back of a sturdy chair if you would like support.',
      'Lift your right knee to a comfortable height, then lower your foot.', 'Lift your left knee, then lower your foot.',
      'Keep marching at a steady pace, swinging your arms gently if that feels comfortable.', 'For the last minute, slow down gradually before stopping.'],
    guidance: '3 to 5 minutes at a pace where you can still talk comfortably.',
    safety: [STOP_NOTE, 'Stop and rest if you feel chest discomfort or unusual breathlessness.', 'Start slowly and build up over several days.', 'Keep a chair close by if your balance is uncertain.'],
  },
  {
    id: 'easy-walk', name: 'Easy 10-minute walk', category: 'Physical Activity', minutes: 10,
    description: 'A short walk at a comfortable, conversational pace.',
    steps: ['Start by walking slowly for about 2 minutes.', 'Walk at a comfortable pace where you can still hold a conversation.',
      'Keep your shoulders relaxed and let your arms swing naturally.', 'For the last 2 minutes, slow down gradually.'],
    guidance: 'About 10 minutes. You can split it into two 5-minute walks.',
    safety: [STOP_NOTE, 'Stop and rest if you feel chest discomfort or unusual breathlessness.', 'Choose a safe route and dress for the weather.'],
  },
  {
    id: 'shoulder-rolls', name: 'Shoulder rolls', category: 'Posture and Desk Relief', minutes: 2,
    description: 'Slow, small circles with the shoulders, done sitting or standing.',
    steps: ['Sit or stand tall with your arms relaxed by your sides.', 'Gently lift your shoulders up towards your ears.',
      'Roll your shoulders back and then down, and let them relax.', 'Repeat 5 times, then do 5 rolls in the forward direction.'],
    guidance: '5 rolls backwards and 5 rolls forwards. Repeat once or twice through the day.',
    safety: [STOP_NOTE, 'Keep the circles small and slow.'],
  },
  {
    id: 'seated-chin-tuck', name: 'Seated chin tuck', category: 'Posture and Desk Relief', minutes: 2,
    description: 'A small movement that gently draws the head back over the shoulders.',
    steps: ['Sit tall and look straight ahead.', 'Gently glide your chin straight back, keeping your eyes level. Do not tilt your head down.',
      'Hold for 3 to 5 seconds.', 'Relax back to the starting position.'],
    guidance: '5 to 10 times.',
    safety: [STOP_NOTE, 'Keep the movement small and comfortable.', 'Stop if you feel tingling or numbness in your arms.'],
  },
  {
    id: 'progressive-muscle-relaxation', name: 'Progressive muscle relaxation', category: 'Relaxation', minutes: 10,
    description: 'Gently tensing and then releasing one muscle group at a time.',
    steps: ['Sit or lie down comfortably. Close your eyes if that feels comfortable.',
      'Start with your feet. Gently tense the muscles for about 5 seconds, without straining.',
      'Release and notice the feeling of relaxing for about 10 seconds.',
      'Move slowly up the body: calves, thighs, hands, arms, shoulders and face.', 'Finish with a few slow, comfortable breaths.'],
    guidance: 'About 10 minutes for the whole body. You can do a shorter version with just a few areas.',
    safety: [STOP_NOTE, 'Tense gently; it should never hurt.', 'Skip any area that is injured or sore.', 'If a muscle starts to cramp, release it straight away.'],
  },
  {
    id: 'senses-pause', name: '5-4-3-2-1 senses pause', category: 'Relaxation', minutes: 5,
    description: 'A short pause that uses your senses to notice what is around you.',
    steps: ['Notice 5 things you can see.', 'Notice 4 things you can feel, such as your feet on the floor.', 'Notice 3 things you can hear.',
      'Notice 2 things you can smell, or two smells you like.', 'Notice 1 thing you can taste, then take a slow breath.'],
    guidance: 'Once through, at your own pace. Repeat if you like.',
    safety: [STOP_NOTE, 'You can stop at any time. If difficult feelings come up, consider talking with someone you trust.'],
  },
];

export const EXERCISE_IDS = EXERCISES.map((e) => e.id);

// Source: frontend/src/compnents/journal/JournalPrompts.jsx (JOURNAL_PROMPTS)
const JOURNAL_PROMPTS = [
  'Something that went well today was…',
  "Right now I'm feeling… because…",
  "One thing I'm grateful for is…",
  "Something that's been on my mind lately is…",
  'One small thing I can do for myself this week is…',
  "A moment from today I'd like to remember is…",
];

// Source: frontend/src/compnents/quiz/quizData.js (CATEGORIES, DISCLAIMER, RULES_NOTICE, SUPPORT_NOTICE)
const QUIZZES = [
  ['Quick daily check-in', 'A short pulse on mood, energy, calm and rest.'],
  ['Stress & calm', 'Looks at calm, coping and physical tension.'],
  ['Sleep & rest', 'Looks at how rested you feel and your sleep habits.'],
  ['Connection & support', 'Looks at closeness to others and the support around you.'],
  ['Focus & balance', 'Looks at focus and the balance between effort and rest.'],
  ['Two-week reflection', 'Reflect on how often you have noticed common feelings over the past two weeks. Not scored or saved.'],
];
const QUIZ_DISCLAIMER = 'This quiz is for self-reflection only. It is not a medical or psychological assessment and cannot diagnose any condition.';
const QUIZ_RULES_NOTICE = 'Insights and suggestions are produced by simple, fixed rules applied to your answers. They are not generated by AI and are not professional advice.';
export const SUPPORT_NOTICE = 'If you have been feeling low or overwhelmed for a while, consider talking to someone you trust '
  + 'or to a doctor or other qualified health professional. If you are in immediate danger, contact your local emergency services.';

// Source: frontend/src/compnents/quiz/quizEngine.js (AREA_SUGGESTIONS)
const AREA_SUGGESTIONS = [
  ['Mood', 'a short journal entry ("What is one small thing that went okay today?") and a daily mood check-in'],
  ['Energy', 'Easy 10-minute walk (gentle movement can lift energy) and Marching on the spot (a quick indoor reset)'],
  ['Calm', 'Box breathing (slows things down when stress is high) and the 5-4-3-2-1 senses pause (brings attention back to the present)'],
  ['Coping', 'a journal entry ("What is one thing I can let go of this week?") and Box breathing (a steady pause before the next task)'],
  ['Body tension', 'Progressive muscle relaxation (releases tension step by step) and Shoulder rolls (loosens tight shoulders)'],
  ['Rest', 'Belly breathing (a calm way to wind down before bed) and a daily mood check-in'],
  ['Sleep routine', 'Child’s pose (a gentle stretch for a screen-free wind-down) and a journal entry ("What would a calmer evening routine look like for me?")'],
  ['Connection', 'the anonymous community and a journal entry ("Who is someone I would like to reconnect with?")'],
  ['Support', 'the Support options page and the anonymous community'],
  ['Focus', 'Seated chin tuck (a quick desk reset between tasks) and a short guided meditation session'],
  ['Balance', 'Gentle neck side stretch (a short break from the screen) and a journal entry ("What is one thing I enjoy that I can make time for?")'],
];

// Source: backend/services/assistant/mockAssistant.js (TOPIC_TIPS, SCREEN_TIP; not the symptom texts)
const TOPIC_TIPS = [
  ['Work pressure', 'Writing the tasks down and choosing one small one to start with helps some people feel less overloaded.'],
  ['Studies', 'Short study blocks with small breaks in between work well for some people.'],
  ['Stress', 'A few slow breaths or a short walk can give a moment of space.'],
  ['Worries', 'Some people find it helps to write the worry down and set a later time to look at it again.'],
  ['Sleep', 'A regular wind-down routine away from screens works for some people.'],
  ['Feeling alone', 'Reaching out to one person you trust, even with a short message, can be a small first step.'],
  ['Screen time', 'Long stretches in front of a screen can be tiring, so short breaks away from it may help.'],
];

// Source: frontend/src/compnents/support/Support.jsx
const SUPPORT_PAGE = [
  'If you are in immediate danger: contact your local emergency services straight away, or go to the nearest hospital emergency department.',
  'Talk to someone you trust: a friend, family member, colleague or teacher can listen and help you think about next steps.',
  'Speak with a professional: a doctor or a licensed mental health professional can talk through how you have been feeling and what support might help.',
  'About WellBridge: WellBridge is a self-care tool. It is not a crisis service, it is not monitored, and it cannot contact anyone on your behalf.',
];

// Sources: frontend/src/compnents/navbar/Navbar.jsx, backend/controller/mood-controller.js,
// frontend/src/compnents/journal/JournalPrompts.jsx, backend/utils/communityContent.js
const APP_FEATURES = [
  'Dashboard: a personal overview of recent check-ins, meditation sessions and journals.',
  'Mood Tracker: one daily check-in with a 1 to 5 rating, and optionally energy, hours slept, factors (sleep, work, social, exercise, health, other) and a short note. Today’s check-in can be edited on the same day.',
  'Meditation: a log of meditation sessions and the wellness exercises listed below.',
  'Quiz: short self-reflection quizzes (listed below).',
  'Journals: write entries, optionally starting from a prompt; each journal can be marked private.',
  'Anonymous Sharing: read and share posts without your name attached. Contact details and links are not allowed, and some posts are reviewed before they appear.',
  'Support options: general ways to find help (see below).',
];

const bulletList = (items) => items.map((item) => `- ${item}`).join('\n');

const exerciseText = (e) => [
  `### ${e.name} (${e.category}, about ${e.minutes} min)`,
  e.description,
  `Steps: ${e.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`,
  `How much: ${e.guidance}`,
  `Safety: ${e.safety.join(' ')}`,
].join('\n');

export const DIGEST_TEXT = [
  `# Approved WellBridge content (${DIGEST_VERSION})`,
  '## WellBridge features',
  bulletList(APP_FEATURES),
  '## Wellness exercises',
  EXERCISE_NOTICE,
  EXERCISES.map(exerciseText).join('\n\n'),
  '## Journal prompts',
  bulletList(JOURNAL_PROMPTS),
  '## Self-reflection quizzes',
  bulletList(QUIZZES.map(([title, description]) => `${title}: ${description}`)),
  QUIZ_DISCLAIMER,
  QUIZ_RULES_NOTICE,
  '## What WellBridge suggests for each wellbeing area',
  bulletList(AREA_SUGGESTIONS.map(([area, suggestion]) => `${area}: ${suggestion}`)),
  '## Everyday tips',
  bulletList(TOPIC_TIPS.map(([topic, tip]) => `${topic}: ${tip}`)),
  '## Finding support',
  bulletList(SUPPORT_PAGE),
  SUPPORT_NOTICE,
].join('\n\n');
