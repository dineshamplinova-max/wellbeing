// Development-only mock of the WellBridge AI Support assistant.
//
// A small, deterministic rule engine: the same message and history always give
// the same reply. It looks at the new message plus the recent turns the page
// sends (validated in history.js) to notice what was already mentioned and asked.
// When the last reply asked a question, a short message such as "1 hour back",
// "yes" or "a little" is read as the answer to that question rather than as a
// new topic. It makes no network requests, stores nothing, never repeats the
// user's words back, and treats history only as context, never as fact.
//
// It is not a therapist and not a clinical tool: keyword rules cannot assess
// symptoms. It never diagnoses, never names causes, and never mentions
// medication. Physical symptoms are kept separate from emotional topics.
//
// PENDING CLINICAL REVIEW: the general "speak to a doctor / get medical help"
// sentences below (SYMPTOM_CAUTION, WATCH_TIP, RETURN_TIP, DIZZY_TIP) are conservative
// placeholders, not approved clinical guidance. Possible emergencies never reach
// this module: safety.js screens them first and returns its own placeholder.

export const MOCK_MODE = 'mock';

const normalise = (text) => ` ${String(text)
  .toLowerCase()
  .replace(/[‘’`]/g, "'")
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()} `;
const has = (text, phrases) => phrases.some((phrase) => text.includes(` ${phrase} `));
const unique = (list) => [...new Set(list)];
const joinList = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0]);
const wordCount = (text) => text.trim().split(' ').filter(Boolean).length;

// ---- What a message is about ------------------------------------------------

// Physical symptoms, with how each is named in a sentence.
const SYMPTOMS = [
  { name: 'headache', label: 'a headache', phrases: ['headache', 'headaches', 'head ache', 'head hurts', 'head is hurting', 'head pain', 'migraine'] },
  { name: 'stomach ache', label: 'a stomach ache', phrases: ['stomach ache', 'stomachache', 'tummy ache', 'stomach hurts', 'stomach pain'] },
  { name: 'back pain', label: 'back pain', phrases: ['back pain', 'back hurts', 'backache', 'back ache'] },
  { name: 'neck or shoulder pain', label: 'neck or shoulder pain', phrases: ['neck pain', 'neck hurts', 'shoulder pain', 'stiff shoulders'] },
  { name: 'eye strain', label: 'eye strain', phrases: ['eye strain', 'eyes hurt', 'sore eyes', 'tired eyes', 'dry eyes'] },
  { name: 'dizziness', label: 'dizziness', phrases: ['dizzy', 'dizziness', 'lightheaded', 'light headed'] },
  { name: 'nausea', label: 'nausea', phrases: ['nausea', 'nauseous', 'feel sick', 'feeling sick'] },
  { name: 'fever', label: 'a fever', phrases: ['fever', 'high temperature'] },
];

// Emotional and everyday topics, kept separate from physical symptoms.
const TOPICS = [
  { name: 'work', label: 'work pressure', phrases: ['work', 'job', 'workload', 'office', 'boss', 'deadline', 'deadlines', 'project', 'projects', 'overtime', 'meetings'] },
  { name: 'study', label: 'studies', phrases: ['study', 'studies', 'studying', 'exam', 'exams', 'assignment', 'assignments', 'homework', 'school', 'university', 'college'] },
  { name: 'stress', label: 'stress', phrases: ['stress', 'stressed', 'pressure', 'overwhelmed', 'burnt out', 'burned out', 'burnout', 'too much'] },
  { name: 'worry', label: 'worries', phrases: ['worried', 'worry', 'worrying', 'anxious', 'anxiety', 'nervous', 'overthinking', 'scared', 'uneasy'] },
  { name: 'sleep', label: 'sleep', phrases: ['sleep', 'sleeping', 'insomnia', 'tired', 'exhausted', "can't sleep", 'cant sleep'] },
  { name: 'loneliness', label: 'feeling alone', phrases: ['lonely', 'alone', 'isolated', 'left out', 'no friends'] },
];

const SCREEN_WORDS = ['screen time', 'screen', 'screens', 'laptop', 'computer', 'phone', 'monitor'];
const SEVERE_WORDS = ['severe', 'heavy', 'really bad', 'very bad', 'terrible', 'unbearable', 'intense', 'awful'];
const WORSE_WORDS = ['worse', 'getting worse', 'worsening', "won't go away", 'wont go away', 'not going away', 'not easing'];
const GREETING_WORDS = ['hello', 'hi', 'hey', 'salam', 'good morning', 'good afternoon', 'good evening'];

const symptomsIn = (text) => SYMPTOMS.filter((s) => has(text, s.phrases));
const topicsIn = (text) => TOPICS.filter((t) => has(text, t.phrases));
const symptomByName = (name) => SYMPTOMS.find((s) => s.name === name);
const topicByName = (name) => TOPICS.find((t) => t.name === name);

// ---- Short answers ----------------------------------------------------------------

// Which single option a short answer matches: its key, 'ambiguous' when it
// matches more than one option, or null. Longer phrases are matched first and
// removed, so "not bad" is not also read as "bad", or "it has not" as "it has".
const classify = (text, options) => {
  const phrases = Object.entries(options)
    .flatMap(([key, list]) => list.map((phrase) => [phrase, key]))
    .sort((a, b) => b[0].length - a[0].length);
  let rest = text;
  const keys = new Set();
  for (const [phrase, key] of phrases) {
    if (rest.includes(` ${phrase} `)) {
      keys.add(key);
      rest = rest.split(` ${phrase} `).join('  ');
    }
  }
  if (keys.size === 0) return null;
  return keys.size === 1 ? [...keys][0] : 'ambiguous';
};

const SEVERITY = {
  mild: ['a little', 'a little bit', 'little', 'a bit', 'mild', 'mildly', 'slight', 'slightly', 'not bad', 'not too bad', 'manageable', 'minor'],
  moderate: ['moderate', 'medium', 'in between', 'in the middle', 'so so', 'average'],
  severe: ['severe', 'strong', 'very strong', 'really strong', 'bad', 'quite bad', ...SEVERE_WORDS],
};

const YES = ['yes', 'yeah', 'yep', 'yup', 'ya', 'sure', 'i think so', 'definitely', 'of course', 'it has', 'they have'];
const NO = ['no', 'nope', 'nah', 'not really', 'not yet', 'not at all', "it hasn't", "they haven't", 'it has not', 'they have not',
  "i don't think so", 'i dont think so', 'no one', 'nobody'];
const YES_NO = { yes: YES, no: NO };
const EASED = {
  yes: [...YES, 'better', 'a bit better', 'a little better', 'easing', 'eased', 'gone', 'improving', 'improved', 'a bit', 'a little', 'slightly', 'somewhat'],
  no: [...NO, 'same', 'the same', 'worse', 'still', 'still there', 'not better', 'no better', 'not much better'],
};
const CHECK_IN = {
  better: ['better', 'good', 'fine', 'okay', 'ok', 'improving', 'gone', 'eased'],
  worse: ['worse', 'bad', 'not good', 'not great', 'not okay', 'not ok', 'not fine', 'terrible', 'awful'],
  same: ['same', 'the same', 'about the same', 'no change', 'still', 'not much different', 'not better', 'not much better'],
};
const CLARIFY_ANSWERS = {
  same: ['yes', 'yeah', 'yep', 'it is', 'same', 'the same', 'that one', 'still that'],
  new: ['no', 'nope', 'new', 'something new', 'something else', 'different', 'something different'],
};

// When something started, from answers like "1 hour back", "two days", "since morning".
const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const UNITS = { minute: 'minute', minutes: 'minute', min: 'minute', mins: 'minute', hour: 'hour', hours: 'hour', hr: 'hour', hrs: 'hour', day: 'day', days: 'day', week: 'week', weeks: 'week' };
const DURATION = / (\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|few|couple of|half an) (minutes?|mins?|hours?|hrs?|days?|weeks?) /;
const SINCE = [
  [['just now', 'just started', 'a moment ago', 'recently', 'right now', 'minutes ago'], { kind: 'recent' }],
  [['woke up', 'waking up', 'got up'], { kind: 'since', phrase: 'you woke up' }],
  [['last night', 'overnight'], { kind: 'since', phrase: 'last night' }],
  [['yesterday'], { kind: 'since', phrase: 'yesterday' }],
  [['last week'], { kind: 'since', phrase: 'last week' }],
  [['morning'], { kind: 'since', phrase: 'this morning' }],
  [['lunch', 'lunchtime'], { kind: 'since', phrase: 'lunchtime' }],
  [['afternoon'], { kind: 'since', phrase: 'this afternoon' }],
  [['evening', 'tonight'], { kind: 'since', phrase: 'this evening' }],
  [['today', 'earlier'], { kind: 'since', phrase: 'earlier today' }],
  [['a while', 'ages', 'a long time', 'days', 'weeks', 'all week'], { kind: 'while' }],
];

export const parseTiming = (text) => {
  const match = text.match(DURATION);
  if (match) {
    const unit = UNITS[match[2]];
    const amount = match[1];
    if (amount === 'half an') return { kind: 'ago', phrase: `about half an ${unit} ago` };
    if (amount === 'few' || amount === 'couple of') return { kind: 'ago', phrase: `about a ${amount} ${unit}s ago` };
    const n = /^\d+$/.test(amount) ? Number(amount) : NUMBERS[amount];
    if (n === 1) return { kind: 'ago', phrase: `about ${unit === 'hour' ? 'an' : 'a'} ${unit} ago` };
    return { kind: 'ago', phrase: `about ${n} ${unit}s ago` };
  }
  const since = SINCE.find(([phrases]) => has(text, phrases));
  return since ? since[1] : null;
};

// ---- Questions (asked at most once each per conversation) ---------------------

// Grammar for "the headache" (it) or "the headache and dizziness" (they).
const describe = (names, plural = names.length > 1) => ({
  subject: joinList(names),
  it: plural ? 'they' : 'it',
  is: plural ? 'are' : 'is',
  has: plural ? 'have' : 'has',
  Has: plural ? 'Have' : 'Has',
  hasnt: plural ? "haven't" : "hasn't",
  sounds: plural ? 'sound' : 'sounds',
  itIs: plural ? "they're" : "it's",
});

const QUESTIONS = {
  onset: (d) => `When did the ${d.subject} start?`,
  onsetClarify: (d) => `Roughly when did ${d.it} start, for example this morning or about an hour ago?`,
  severity: (d) => `Would you say ${d.it} ${d.is} mild, moderate or severe right now?`,
  severityClarify: (d) => `Would you call ${d.it} mild, moderate or severe?`,
  eased: (d) => `${d.Has} ${d.it} eased at all since ${d.it} started?`,
  easedClarify: (d) => `Just to check, ${d.has} ${d.it} eased at all: yes or no?`,
  work: 'Which part of the work feels heaviest at the moment?',
  study: 'Which part of your studies is weighing on you most?',
  stress: 'What has been adding the most pressure lately?',
  worry: 'What has been on your mind the most?',
  sleep: 'How have the last few nights been for you?',
  loneliness: 'Is there someone you feel comfortable contacting?',
  contactClarify: 'Just to check, is there someone you could contact: yes or no?',
  clarify: (label) => `Is this about the ${label} you mentioned, or something new?`,
  checkIn: 'How is that now?',
  checkInClarify: 'Is it better, worse or about the same?',
  open: 'What would you like to talk about?',
};

// Which question the last reply ended with, so a short answer can be read against it.
const PENDING = [
  [/Roughly when did .+ start, for example .+\?$/, 'onset', true],
  [/When did the .+ start\?$/, 'onset', false],
  [/Would you call .+ mild, moderate or severe\?$/, 'severity', true],
  [/mild, moderate or severe right now\?$/, 'severity', false],
  [/eased at all: yes or no\?$/, 'eased', true],
  [/eased at all since .+ started\?$/, 'eased', false],
  [/someone you could contact: yes or no\?$/, 'contact', true],
  [/Is there someone you feel comfortable contacting\?$/, 'contact', false],
  [/Is it better, worse or about the same\?$/, 'checkIn', true],
  [/How is that now\?$/, 'checkIn', false],
  [/Is this about the .+ you mentioned, or something new\?$/, 'clarifyTopic', true],
];

export const pendingQuestion = (reply) => {
  const text = String(reply || '').trim();
  if (!text.endsWith('?')) return null;
  const found = PENDING.find(([pattern]) => pattern.test(text));
  if (found) {
    const label = found[1] === 'clarifyTopic' ? text.match(/Is this about the (.+) you mentioned/)[1] : null;
    return { kind: found[1], clarified: found[2], label };
  }
  const topic = TOPICS.find((t) => text.endsWith(QUESTIONS[t.name]));
  return topic ? { kind: 'topic', clarified: false, topic } : null;
};

// ---- Wording --------------------------------------------------------------------

const TOPIC_ACKS = {
  work: ['A heavy workload can really wear you down.', 'That sounds like a lot of work to carry.'],
  study: ['Studying under pressure can be exhausting.', 'That sounds like a demanding time with your studies.'],
  stress: ['That sounds stressful.', 'It sounds like the pressure has been building.'],
  worry: ['Worry can be really draining.', 'That sounds like a lot to carry around in your head.'],
  sleep: ['Poor sleep can make everything feel harder.', 'Being tired can colour the whole day.'],
  loneliness: ['Feeling alone can be hard.', 'That sounds lonely.'],
};

const TOPIC_TIPS = {
  work: 'Writing the tasks down and choosing one small one to start with helps some people feel less overloaded.',
  study: 'Short study blocks with small breaks in between work well for some people.',
  stress: 'A few slow breaths or a short walk can give a moment of space.',
  worry: 'Some people find it helps to write the worry down and set a later time to look at it again.',
  sleep: 'A regular wind-down routine away from screens works for some people.',
  loneliness: 'Reaching out to one person you trust, even with a short message, can be a small first step.',
};

const SCREEN_TIP = 'Long stretches in front of a screen can be tiring, so short breaks away from it may help.';
const SYMPTOM_TIP = 'Resting, having some water and taking a break from screens or bright light help some people feel a bit more comfortable.';

// PENDING CLINICAL REVIEW (see the note at the top of this file).
const SYMPTOM_CAUTION = 'it would be sensible to speak to a doctor or another qualified health professional. '
  + 'If it is sudden, very severe or unlike anything you have had before, please get medical help straight away.';
const WATCH_TIP = "If things don't ease, keep coming back or get worse, it would be worth checking with a doctor.";
const RETURN_TIP = 'If anything comes back, gets worse or new symptoms appear, it would be worth checking with a doctor.';
const DIZZY_TIP ='If you feel dizzy, sitting or lying down somewhere safe until it passes can help.';

const UNSURE = "I'm not sure I've understood that.";
const STILL_UNSURE = "I'm still not sure I've understood, and that's okay. We can leave that question for now, "
  + 'and you can tell me anything else in your own words.';

const pick = (options, variant) => options[variant % options.length];

// ---- Conversation state, derived from the supplied history only --------------------

export const conversationState = (history = []) => {
  const userTexts = [];
  const assistantTexts = [];
  let currentSymptoms = [];
  let severityKnown = false;
  let previousReply = '';
  for (const turn of history) {
    if (turn.role === 'assistant') {
      assistantTexts.push(turn.content);
      previousReply = turn.content;
      continue;
    }
    const text = normalise(turn.content);
    userTexts.push(text);
    const found = symptomsIn(text).map((s) => s.name);
    if (found.length) currentSymptoms = found;
    // Severity counts when it was said about a symptom or in answer to a symptom question.
    const answering = ['onset', 'severity'].includes(pendingQuestion(previousReply)?.kind);
    if ((found.length || answering) && ['mild', 'moderate', 'severe'].includes(classify(text, SEVERITY))) severityKnown = true;
  }
  const lastAssistant = assistantTexts[assistantTexts.length - 1] || '';
  const symptoms = unique(userTexts.flatMap((t) => symptomsIn(t).map((s) => s.name)));
  const topics = unique(userTexts.flatMap((t) => topicsIn(t).map((x) => x.name)));
  // The most recent thing the user shared, for check-ins and clarifying questions.
  let recentLabel = null;
  for (let i = userTexts.length - 1; i >= 0 && !recentLabel; i -= 1) {
    const s = symptomsIn(userTexts[i])[0];
    const t = topicsIn(userTexts[i])[0];
    recentLabel = s ? s.name : t ? t.label : null;
  }
  return {
    symptoms,
    currentSymptoms,
    severityKnown,
    topics,
    screen: userTexts.some((t) => has(t, SCREEN_WORDS)),
    userTurns: userTexts.length,
    recentLabel,
    lastAssistant,
    asked: (question) => assistantTexts.some((text) => text.includes(question)),
  };
};

const currentDescription = (state) => (state.currentSymptoms.length
  ? describe(state.currentSymptoms)
  : describe(['symptoms'], true));

// Builds the reply from parts; never more than one question.
const compose = (parts, question) => [...parts.filter(Boolean), question].filter(Boolean).join(' ');

// ---- Reply rules ----------------------------------------------------------------

const symptomReply = (found, ctx) => {
  const { state, text, variant } = ctx;
  const repeated = found.filter((s) => state.symptoms.includes(s.name));
  const severe = has(text, SEVERE_WORDS);
  const worse = has(text, WORSE_WORDS);

  // Repeated, stressed or worsening: focus on it, add the caution, ask nothing.
  if (repeated.length || severe || worse) {
    const symptom = repeated[0] || found[0];
    const reason = severe ? 'Since it sounds severe,' : worse ? 'Since it seems to be getting worse,' : 'Since it is still bothering you,';
    const focus = repeated.length
      ? `It sounds like the ${symptom.name} has become the main concern now, so let's focus on that.`
      : pick([`I'm sorry you're dealing with ${symptom.label}.`, `That sounds really uncomfortable.`], variant);
    return { reply: compose([focus, `${reason} ${SYMPTOM_CAUTION}`, SYMPTOM_TIP]), category: 'physical' };
  }

  // First mention: acknowledge every symptom named, note other concerns separately,
  // and ask one useful question.
  const d = describe(found.map((s) => s.name));
  const mild = classify(text, SEVERITY) === 'mild'
    ? `It sounds like ${d.it} ${d.is} fairly mild at the moment, which is good to know.`
    : null;
  const otherTopic = topicsIn(text)[0] || (state.topics[0] && topicByName(state.topics[0]));
  const separate = otherTopic
    ? `I'll keep the ${otherTopic.label} you mentioned in mind as a separate thing, without assuming one caused the other.`
    : null;
  const dizzy = found.some((s) => s.name === 'dizziness') ? DIZZY_TIP : null;
  const question = state.asked(QUESTIONS.onset(d)) ? null : QUESTIONS.onset(d);
  return {
    reply: compose([`I'm sorry you're dealing with ${joinList(found.map((s) => s.label))}.`, mild, separate, SYMPTOM_TIP, dizzy], question),
    category: 'physical',
  };
};

const topicReply = (topic, ctx) => {
  const { state, text, variant } = ctx;
  const earlierSymptom = state.symptoms[0] && symptomByName(state.symptoms[0]);
  const remember = earlierSymptom
    ? `I haven't forgotten the ${earlierSymptom.name} you mentioned, and I won't assume one caused the other.`
    : null;
  const tip = has(text, SCREEN_WORDS) ? SCREEN_TIP : TOPIC_TIPS[topic.name];
  const question = state.asked(QUESTIONS[topic.name]) ? null : QUESTIONS[topic.name];
  return { reply: compose([pick(TOPIC_ACKS[topic.name], variant), remember, tip], question), category: topic.name };
};

// The next symptom question not yet asked or answered, if any.
const nextSymptomQuestion = (d, state, severityKnown) => {
  if (!severityKnown && !state.asked(QUESTIONS.severity(d))) return QUESTIONS.severity(d);
  if (!state.asked(QUESTIONS.eased(d))) return QUESTIONS.eased(d);
  return null;
};

const TIMING_SENTENCES = {
  ago: (d, t) => `So the ${d.subject} started ${t.phrase}.`,
  since: (d, t) => `So the ${d.subject} ${d.has} been there since ${t.phrase}.`,
  recent: (d) => `So the ${d.subject} started only recently.`,
  while: (d) => `So the ${d.subject} ${d.has} been going on for a while.`,
};

const onsetAnswer = (timing, d, ctx) => {
  const { state, text } = ctx;
  const severityKnown = state.severityKnown || ['mild', 'moderate', 'severe'].includes(classify(text, SEVERITY));
  const question = nextSymptomQuestion(d, state, severityKnown);
  return {
    reply: compose(['Thanks, that helps.', TIMING_SENTENCES[timing.kind](d, timing), question ? null : WATCH_TIP], question),
    category: 'physical',
  };
};

const severityAnswer = (level, d, state) => {
  if (level === 'severe') {
    return { reply: compose(['Thanks for telling me.', `Since ${d.it} ${d.sounds} strong, ${SYMPTOM_CAUTION}`]), category: 'physical' };
  }
  const question = state.asked(QUESTIONS.eased(d)) ? null : QUESTIONS.eased(d);
  const ack = level === 'mild'
    ? `Thanks for letting me know ${d.itIs} mild. Keeping an eye on how ${d.it} change${d.it === 'it' ? 's' : ''} is a good idea.`
    : 'Thanks, that helps me understand how it feels.';
  return { reply: compose([ack, question ? null : WATCH_TIP], question), category: 'physical' };
};

const easedAnswer = (answer, d) => (answer === 'yes'
  ? { reply: compose([`I'm glad ${d.itIs} easing.`, RETURN_TIP]), category: 'physical' }
  : { reply: compose([`Since ${d.it} ${d.hasnt} eased, ${SYMPTOM_CAUTION}`, SYMPTOM_TIP]), category: 'physical' });

const contactAnswer = (answer) => (answer === 'yes'
  ? { reply: "That's good to hear. Sending them a short message, even just to say hello, could be a gentle first step.", category: 'loneliness' }
  : {
    reply: "That's okay, and it's more common than people think. Some people find it easier to start small, for example "
      + 'with a group or activity around something they enjoy.',
    category: 'loneliness',
  });

const checkInAnswer = (answer, state) => {
  const symptom = Boolean(symptomByName(state.recentLabel));
  if (answer === 'better') return { reply: "I'm glad it's a bit better.", category: 'general' };
  if (answer === 'same') {
    return { reply: compose(["Thanks for letting me know it's about the same.", symptom ? WATCH_TIP : null]), category: 'general' };
  }
  return symptom
    ? { reply: `Since it seems to be getting worse, ${SYMPTOM_CAUTION}`, category: 'physical' }
    : { reply: "I'm sorry it feels worse right now. Talking to someone you trust, or a qualified professional, can help.", category: 'general' };
};

const clarifyTopicAnswer = (answer, label) => (answer === 'same'
  ? { reply: `Okay, thanks. Let's stay with the ${label}. You can tell me whatever feels most useful about it.`, category: 'general' }
  : { reply: "Okay, something new. Tell me about it in your own words whenever you're ready.", category: 'general' });

// A short clarification tied to the pending question, asked once; after that, an
// honest reply with no further question.
const CLARIFY = {
  onset: (d) => QUESTIONS.onsetClarify(d),
  severity: (d) => QUESTIONS.severityClarify(d),
  eased: (d) => QUESTIONS.easedClarify(d),
  contact: () => QUESTIONS.contactClarify,
  checkIn: () => QUESTIONS.checkInClarify,
};

const clarifyPending = (pending, state) => {
  const ask = CLARIFY[pending.kind];
  if (!ask || pending.clarified) return { reply: STILL_UNSURE, category: 'general' };
  return { reply: compose([UNSURE], ask(currentDescription(state))), category: 'general' };
};

// Reads the message as an answer to the pending question. Returns a reply, or
// null when it is not an answer (so it is handled as a new message).
const answerPending = (pending, ctx) => {
  const { state, text } = ctx;
  if (pending.kind === 'topic') return null; // open questions: handled after new-topic checks
  // A long message that brings up symptoms or topics is a new message, not a short answer.
  if (wordCount(text) > 8 && (symptomsIn(text).length || topicsIn(text).length)) return null;
  const d = currentDescription(state);
  const read = (options, respond) => {
    const answer = classify(text, options);
    if (answer === 'ambiguous') return clarifyPending(pending, state);
    return answer ? respond(answer) : null;
  };
  switch (pending.kind) {
    case 'onset': {
      const timing = parseTiming(text);
      return timing ? onsetAnswer(timing, d, ctx) : null;
    }
    case 'severity':
      if (has(text, WORSE_WORDS)) return severityAnswer('severe', d, state);
      return read(SEVERITY, (level) => severityAnswer(level, d, state));
    case 'eased':
      return read(EASED, (answer) => easedAnswer(answer, d));
    case 'contact':
      return read(YES_NO, contactAnswer);
    case 'checkIn':
      return read(CHECK_IN, (answer) => checkInAnswer(answer, state));
    case 'clarifyTopic':
      return read(CLARIFY_ANSWERS, (answer) => clarifyTopicAnswer(answer, pending.label));
    default:
      return null;
  }
};

// A message that answered nothing and raised nothing new, while a question is pending.
const pendingFallback = (pending, state) => {
  if (pending.kind === 'topic') {
    return { reply: compose(['That makes sense, thank you.', TOPIC_TIPS[pending.topic.name]]), category: pending.topic.name };
  }
  return clarifyPending(pending, state);
};

const greetingReply = (state) => {
  if (state.recentLabel) {
    // Something was already shared: do not restart the conversation.
    const question = state.asked(QUESTIONS.checkIn) ? null : QUESTIONS.checkIn;
    return { reply: compose([`Hello again. Earlier you mentioned the ${state.recentLabel}.`], question), category: 'greeting' };
  }
  const question = state.asked(QUESTIONS.open) ? null : QUESTIONS.open;
  return { reply: compose(['Hello. This is a practice version of WellBridge AI Support.'], question), category: 'greeting' };
};

// Honest when unsure, instead of pretending to understand.
const unclearReply = (state) => {
  if (state.recentLabel && !state.asked(QUESTIONS.clarify(state.recentLabel))) {
    return { reply: compose([UNSURE], QUESTIONS.clarify(state.recentLabel)), category: 'general' };
  }
  return {
    reply: "I'm not sure I've understood that fully. You can put it in your own words, and I'll do my best to follow.",
    category: 'general',
  };
};

// Returns { reply, category, conservative }. `history` must already be validated.
// The safeguards are accepted for the future age policy; every reply is already
// the conservative, general one.
export const mockReply = (message, { history = [], safeguards } = {}) => {
  const text = normalise(message);
  const state = conversationState(history);
  const pending = pendingQuestion(state.lastAssistant);
  const build = (variant) => {
    const ctx = { state, text, variant };
    const answered = pending ? answerPending(pending, ctx) : null;
    if (answered) return answered;
    const found = symptomsIn(text);
    if (found.length) return symptomReply(found, ctx);
    const topic = topicsIn(text)[0];
    if (topic) return topicReply(topic, ctx);
    if (has(text, GREETING_WORDS)) return greetingReply(state);
    if (pending) return pendingFallback(pending, state);
    return unclearReply(state);
  };

  // Vary the wording by turn, and avoid sending exactly the previous reply again
  // wherever an alternative wording exists.
  let result = build(state.userTurns);
  if (result.reply === state.lastAssistant) result = build(state.userTurns + 1);
  return { ...result, conservative: safeguards?.conservative !== false };
};
