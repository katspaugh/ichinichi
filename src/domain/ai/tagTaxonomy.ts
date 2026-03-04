export const TAXONOMY_VERSION = "1";

export interface TagDefinition {
  id: string;
  label: string;
  description: string;
  synonyms: string[];
}

export const TAG_TAXONOMY: TagDefinition[] = [
  // --- Work/Daily ---
  { id: "work.work", label: "work", description: "Work tasks, job, office duties, professional responsibilities", synonyms: ["job", "workplace", "career", "employment"] },
  { id: "work.meeting", label: "meeting", description: "Meetings, calls, standups, one-on-ones, syncs", synonyms: ["call", "standup", "sync", "discussion"] },
  { id: "work.deep-work", label: "deep-work", description: "Deep focus sessions, uninterrupted concentrated work", synonyms: ["focus time", "flow state", "heads-down", "concentration"] },
  { id: "work.learning", label: "learning", description: "Learning new skills, courses, tutorials, studying", synonyms: ["study", "course", "tutorial", "training"] },
  { id: "work.commute", label: "commute", description: "Commuting, travel to work, driving, transit", synonyms: ["travel", "driving", "transit", "bus"] },
  { id: "work.errands", label: "errands", description: "Errands, shopping, appointments, tasks outside home", synonyms: ["shopping", "appointment", "pickup", "groceries"] },
  { id: "work.chores", label: "chores", description: "Household chores, cleaning, laundry, dishes, tidying", synonyms: ["cleaning", "laundry", "dishes", "housework"] },
  { id: "work.admin", label: "admin", description: "Administrative tasks, emails, paperwork, bills, scheduling", synonyms: ["emails", "paperwork", "bills", "bureaucracy"] },
  { id: "work.planning", label: "planning", description: "Planning, organizing, scheduling, goal setting", synonyms: ["organizing", "scheduling", "roadmap", "priorities"] },

  // --- Relationships ---
  { id: "relationships.family", label: "family", description: "Family time, parents, siblings, relatives, home life", synonyms: ["parents", "siblings", "relatives", "home life"] },
  { id: "relationships.partner", label: "partner", description: "Partner, spouse, significant other, relationship", synonyms: ["spouse", "wife", "husband", "relationship"] },
  { id: "relationships.child", label: "child", description: "Children, kids, parenting, playing with kids", synonyms: ["kids", "parenting", "daughter", "son"] },
  { id: "relationships.friends", label: "friends", description: "Friends, hanging out, catching up, social plans", synonyms: ["buddy", "mate", "pal", "catching up"] },
  { id: "relationships.socializing", label: "socializing", description: "Social events, parties, dinners, gatherings, going out", synonyms: ["party", "dinner", "gathering", "going out"] },
  { id: "relationships.conflict", label: "conflict", description: "Arguments, disagreements, tension, difficult conversations", synonyms: ["argument", "disagreement", "tension", "fight"] },
  { id: "relationships.gratitude", label: "gratitude", description: "Feeling grateful, thankful, appreciation for others", synonyms: ["thankful", "appreciation", "blessed", "grateful"] },

  // --- Health ---
  { id: "health.sleep", label: "sleep", description: "Sleep quality, insomnia, naps, bedtime, rest", synonyms: ["rest", "tired", "insomnia", "nap"] },
  { id: "health.exercise", label: "exercise", description: "Exercise, workout, gym, running, training", synonyms: ["workout", "gym", "training", "fitness"] },
  { id: "health.walking", label: "walking", description: "Walking, steps, stroll, hiking, getting outside", synonyms: ["steps", "stroll", "hike", "walk"] },
  { id: "health.cycling", label: "cycling", description: "Cycling, biking, bike ride, commute by bike", synonyms: ["biking", "bike ride", "bicycle", "pedaling"] },
  { id: "health.illness", label: "illness", description: "Being sick, cold, flu, fever, feeling unwell", synonyms: ["sick", "cold", "flu", "unwell"] },
  { id: "health.recovery", label: "recovery", description: "Recovering from illness or injury, healing, getting better", synonyms: ["healing", "getting better", "resting", "rehab"] },
  { id: "health.nutrition", label: "nutrition", description: "Food, eating, cooking, diet, meals, healthy eating", synonyms: ["food", "cooking", "diet", "meals"] },
  { id: "health.caffeine", label: "caffeine", description: "Coffee, tea, caffeine intake, energy drinks", synonyms: ["coffee", "tea", "espresso", "energy drink"] },
  { id: "health.alcohol", label: "alcohol", description: "Drinking, wine, beer, cocktails, going out for drinks", synonyms: ["drinking", "wine", "beer", "cocktails"] },

  // --- Mental/Emotional ---
  { id: "emotion.calm", label: "calm", description: "Feeling calm, peaceful, relaxed, at ease", synonyms: ["peaceful", "relaxed", "serene", "at ease"] },
  { id: "emotion.joy", label: "joy", description: "Happiness, joy, excitement, feeling great, elation", synonyms: ["happy", "excited", "elated", "cheerful"] },
  { id: "emotion.motivation", label: "motivation", description: "Feeling motivated, driven, energized, determined", synonyms: ["driven", "energized", "determined", "inspired"] },
  { id: "emotion.focus", label: "focus", description: "Mental focus, concentration, being in the zone", synonyms: ["concentration", "in the zone", "sharp", "attentive"] },
  { id: "emotion.anxiety", label: "anxiety", description: "Anxiety, worry, nervousness, overthinking, dread", synonyms: ["worry", "nervous", "overthinking", "dread"] },
  { id: "emotion.stress", label: "stress", description: "Stress, pressure, overwhelm, burnout, tension", synonyms: ["pressure", "overwhelmed", "burnout", "tense"] },
  { id: "emotion.irritation", label: "irritation", description: "Irritation, frustration, annoyance, impatience", synonyms: ["frustrated", "annoyed", "impatient", "aggravated"] },
  { id: "emotion.sadness", label: "sadness", description: "Sadness, feeling down, melancholy, low mood", synonyms: ["down", "melancholy", "low mood", "blue"] },
  { id: "emotion.loneliness", label: "loneliness", description: "Loneliness, feeling isolated, missing people, disconnected", synonyms: ["isolated", "alone", "disconnected", "missing someone"] },
  { id: "emotion.boredom", label: "boredom", description: "Boredom, restlessness, lack of stimulation, monotony", synonyms: ["restless", "unstimulated", "monotony", "dull"] },
  { id: "emotion.pride", label: "pride", description: "Feeling proud, accomplished, satisfied with achievement", synonyms: ["accomplished", "satisfied", "achievement", "triumph"] },

  // --- Cognitive/Reflection ---
  { id: "cognitive.insight", label: "insight", description: "Insight, aha moment, new understanding, clarity", synonyms: ["aha moment", "epiphany", "clarity", "understanding"] },
  { id: "cognitive.realization", label: "realization", description: "Realization, noticing something new, becoming aware", synonyms: ["noticed", "aware", "dawned on me", "figured out"] },
  { id: "cognitive.decision", label: "decision", description: "Making a decision, choosing, committing to something", synonyms: ["choosing", "committing", "resolved", "decided"] },
  { id: "cognitive.uncertainty", label: "uncertainty", description: "Uncertainty, doubt, indecision, not knowing what to do", synonyms: ["doubt", "indecision", "unsure", "confused"] },
  { id: "cognitive.rumination", label: "rumination", description: "Rumination, overthinking, dwelling on things, going in circles", synonyms: ["overthinking", "dwelling", "going in circles", "stuck in head"] },

  // --- Productivity/Projects ---
  { id: "productivity.creativity", label: "creativity", description: "Creative work, brainstorming, generating ideas, artistic expression", synonyms: ["brainstorming", "ideas", "artistic", "inventive"] },
  { id: "productivity.problem-solving", label: "problem-solving", description: "Solving problems, debugging issues, figuring things out", synonyms: ["troubleshooting", "fixing", "figuring out", "solution"] },
  { id: "productivity.curiosity", label: "curiosity", description: "Curiosity, exploring, tinkering, investigating something new", synonyms: ["exploring", "tinkering", "investigating", "wondering"] },
  { id: "productivity.coding", label: "coding", description: "Programming, coding, software development, writing code", synonyms: ["programming", "development", "software", "code"] },
  { id: "productivity.debugging", label: "debugging", description: "Debugging, fixing bugs, troubleshooting code issues", synonyms: ["bug fix", "troubleshooting", "error", "stack trace"] },
  { id: "productivity.architecture", label: "architecture", description: "Software architecture, system design, technical planning", synonyms: ["system design", "tech design", "refactoring", "structure"] },
  { id: "productivity.research", label: "research", description: "Research, reading papers, investigating topics in depth", synonyms: ["papers", "investigation", "deep dive", "analysis"] },
  { id: "productivity.writing", label: "writing", description: "Writing, drafting, blogging, composing text", synonyms: ["drafting", "blogging", "composing", "authoring"] },
  { id: "productivity.documentation", label: "documentation", description: "Writing documentation, READMEs, guides, technical writing", synonyms: ["docs", "README", "guide", "technical writing"] },
  { id: "productivity.side-project", label: "side-project", description: "Side projects, personal projects, hobby coding, maker projects", synonyms: ["personal project", "hobby project", "maker", "pet project"] },
  { id: "productivity.open-source", label: "open-source", description: "Open source contributions, pull requests, community projects", synonyms: ["OSS", "pull request", "contribution", "community"] },
  { id: "productivity.release", label: "release", description: "Shipping, releasing, deploying, launching something", synonyms: ["shipping", "deploying", "launch", "publish"] },

  // --- Hobbies ---
  { id: "hobbies.music", label: "music", description: "Listening to music, concerts, discovering songs, playlists", synonyms: ["songs", "concert", "playlist", "album"] },
  { id: "hobbies.trumpet", label: "trumpet", description: "Playing trumpet, brass practice, trumpet technique", synonyms: ["brass", "horn", "mouthpiece", "embouchure"] },
  { id: "hobbies.flugelhorn", label: "flugelhorn", description: "Playing flugelhorn, flugelhorn practice, mellow brass tone", synonyms: ["flugel", "brass", "mellow tone", "horn"] },
  { id: "hobbies.practice", label: "practice", description: "Practicing an instrument, skill practice, rehearsal", synonyms: ["rehearsal", "drill", "routine", "repetition"] },
  { id: "hobbies.improvisation", label: "improvisation", description: "Musical improvisation, jamming, soloing, spontaneous playing", synonyms: ["jamming", "soloing", "improv", "spontaneous"] },
  { id: "hobbies.electronics", label: "electronics", description: "Electronics, circuits, soldering, hardware tinkering", synonyms: ["circuits", "soldering", "hardware", "components"] },
  { id: "hobbies.synthesis", label: "synthesis", description: "Sound synthesis, synthesizers, sound design, modular", synonyms: ["synth", "sound design", "modular", "oscillator"] },
  { id: "hobbies.diy", label: "diy", description: "DIY projects, building things, making, crafting", synonyms: ["building", "making", "crafting", "hands-on"] },

  // --- Personal Development ---
  { id: "development.reading", label: "reading", description: "Reading books, articles, long-form content", synonyms: ["book", "article", "literature", "pages"] },
  { id: "development.meditation", label: "meditation", description: "Meditation, sitting practice, breathwork, centering", synonyms: ["sitting", "breathwork", "centering", "stillness"] },
  { id: "development.mindfulness", label: "mindfulness", description: "Mindfulness, present moment awareness, being present", synonyms: ["present moment", "awareness", "being present", "grounding"] },
  { id: "development.discipline", label: "discipline", description: "Self-discipline, willpower, sticking to routines, consistency", synonyms: ["willpower", "routine", "consistency", "self-control"] },
  { id: "development.habits", label: "habits", description: "Habits, daily routines, streaks, habit tracking", synonyms: ["routine", "streak", "daily practice", "habit tracking"] },
  { id: "development.therapy", label: "therapy", description: "Therapy session, counseling, mental health support", synonyms: ["counseling", "therapist", "session", "mental health"] },
  { id: "development.introspection", label: "introspection", description: "Self-reflection, looking inward, journaling about self", synonyms: ["self-reflection", "looking inward", "self-awareness", "examining"] },
  { id: "development.self-image", label: "self-image", description: "Self-image, confidence, identity, how I see myself", synonyms: ["confidence", "identity", "self-perception", "self-esteem"] },

  // --- Environment/Context ---
  { id: "context.home", label: "home", description: "Being at home, home environment, domestic setting", synonyms: ["house", "apartment", "domestic", "living room"] },
  { id: "context.office", label: "office", description: "Being at the office, workplace environment, desk", synonyms: ["workplace", "desk", "coworking", "studio"] },
  { id: "context.outdoors", label: "outdoors", description: "Being outdoors, outside, fresh air, nature", synonyms: ["outside", "fresh air", "nature", "open air"] },
  { id: "context.park", label: "park", description: "Park, garden, green space, playground", synonyms: ["garden", "green space", "playground", "bench"] },
  { id: "context.weather", label: "weather", description: "Weather conditions, rain, sunshine, cold, hot", synonyms: ["rain", "sunshine", "cold", "warm"] },
  { id: "context.travel", label: "travel", description: "Traveling, trip, vacation, visiting new places", synonyms: ["trip", "vacation", "journey", "visiting"] },

  // --- Time Markers ---
  { id: "time.morning", label: "morning", description: "Morning time, waking up, sunrise, start of day", synonyms: ["waking up", "sunrise", "early", "dawn"] },
  { id: "time.afternoon", label: "afternoon", description: "Afternoon time, midday, post-lunch, daytime", synonyms: ["midday", "post-lunch", "daytime", "noon"] },
  { id: "time.evening", label: "evening", description: "Evening time, after work, dinner time, sunset", synonyms: ["after work", "dinner time", "sunset", "dusk"] },
  { id: "time.night", label: "night", description: "Night time, late hours, before bed, darkness", synonyms: ["late", "before bed", "darkness", "midnight"] },
  { id: "time.weekend", label: "weekend", description: "Weekend, Saturday, Sunday, day off, free time", synonyms: ["Saturday", "Sunday", "day off", "free time"] },

  // --- Meta ---
  { id: "meta.highlight", label: "highlight", description: "Day's highlight, best moment, peak experience", synonyms: ["best moment", "peak", "standout", "favorite part"] },
  { id: "meta.challenge", label: "challenge", description: "Challenge faced, difficulty, obstacle, hard thing", synonyms: ["difficulty", "obstacle", "hard", "struggle"] },
  { id: "meta.lesson", label: "lesson", description: "Lesson learned, takeaway, what I learned today", synonyms: ["takeaway", "learned", "moral", "realization"] },
  { id: "meta.milestone", label: "milestone", description: "Milestone reached, achievement, progress marker", synonyms: ["achievement", "progress", "reached", "completed"] },
  { id: "meta.experiment", label: "experiment", description: "Trying something new, experiment, test, exploration", synonyms: ["trying", "test", "exploration", "new approach"] },
];

/**
 * Combines label, description, and synonyms into a single string for embedding.
 * The format produces a natural, search-friendly text that captures semantic meaning.
 */
export function buildTagEmbeddingText(tag: TagDefinition): string {
  return `${tag.label}: ${tag.description}, ${tag.synonyms.join(", ")}`;
}
