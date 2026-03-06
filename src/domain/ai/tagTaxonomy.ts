export const TAXONOMY_VERSION = "3";

export interface TagDefinition {
  id: string;
  label: string;
  description: string;
  synonyms: string[];
}

export const TAG_TAXONOMY: TagDefinition[] = [
  // --- Life Areas ---
  { id: "life.work", label: "work", description: "Work tasks, job, office duties, professional responsibilities", synonyms: ["job", "workplace", "career", "employment"] },
  { id: "life.school", label: "school", description: "School, university, classes, academic life", synonyms: ["university", "classes", "college", "campus"] },
  { id: "life.family", label: "family", description: "Family time, parents, siblings, relatives, home life", synonyms: ["parents", "siblings", "relatives", "home life"] },
  { id: "life.relationship", label: "relationship", description: "Partner, spouse, significant other, romantic relationship", synonyms: ["partner", "spouse", "dating", "romance"] },
  { id: "life.friends", label: "friends", description: "Friends, hanging out, catching up, social plans", synonyms: ["buddy", "mate", "pal", "catching up"] },
  { id: "life.parenting", label: "parenting", description: "Parenting, children, kids, raising children", synonyms: ["kids", "children", "daughter", "son"] },
  { id: "life.social-life", label: "social-life", description: "Social events, parties, dinners, gatherings, going out", synonyms: ["party", "dinner", "gathering", "going out"] },
  { id: "life.home", label: "home", description: "Home life, domestic activities, house maintenance", synonyms: ["house", "apartment", "domestic", "living"] },
  { id: "life.finances", label: "finances", description: "Money, budgeting, savings, financial planning, expenses", synonyms: ["money", "budget", "savings", "expenses"] },
  { id: "life.travel", label: "travel", description: "Traveling, trip, vacation, visiting new places", synonyms: ["trip", "vacation", "journey", "visiting"] },
  { id: "life.hobbies", label: "hobbies", description: "Hobbies, leisure activities, pastimes, recreational pursuits", synonyms: ["leisure", "pastimes", "recreation", "interests"] },
  { id: "life.volunteering", label: "volunteering", description: "Volunteering, community service, helping others, charity", synonyms: ["community service", "charity", "helping", "nonprofit"] },

  // --- Work / Study ---
  { id: "work.meeting", label: "meeting", description: "Meetings, calls, standups, one-on-ones, syncs", synonyms: ["call", "standup", "sync", "discussion"] },
  { id: "work.deadline", label: "deadline", description: "Deadline, due date, time pressure, crunch", synonyms: ["due date", "crunch", "time pressure", "submission"] },
  { id: "work.project", label: "project", description: "Project work, initiatives, deliverables", synonyms: ["initiative", "deliverable", "assignment", "task"] },
  { id: "work.planning", label: "planning", description: "Planning, organizing, scheduling, goal setting", synonyms: ["organizing", "scheduling", "roadmap", "priorities"] },
  { id: "work.progress", label: "progress", description: "Making progress, moving forward, getting things done", synonyms: ["advancing", "moving forward", "momentum", "getting done"] },
  { id: "work.achievement", label: "achievement", description: "Achievement, accomplishment, success, completing something", synonyms: ["accomplishment", "success", "completed", "finished"] },
  { id: "work.challenge", label: "challenge", description: "Work challenge, difficult task, obstacle, problem", synonyms: ["difficulty", "obstacle", "problem", "hard task"] },
  { id: "work.mistake", label: "mistake", description: "Mistake, error, failure, learning from errors", synonyms: ["error", "failure", "blunder", "wrong"] },
  { id: "work.learning", label: "learning", description: "Learning new skills, courses, tutorials, studying", synonyms: ["study", "course", "tutorial", "training"] },
  { id: "work.exam", label: "exam", description: "Exam, test, quiz, assessment, evaluation", synonyms: ["test", "quiz", "assessment", "evaluation"] },
  { id: "work.presentation", label: "presentation", description: "Presentation, talk, speech, demo, pitch", synonyms: ["talk", "speech", "demo", "pitch"] },
  { id: "work.networking", label: "networking", description: "Networking, professional connections, meetups, conferences", synonyms: ["connections", "meetup", "conference", "contacts"] },
  { id: "work.job-search", label: "job-search", description: "Job search, applications, interviews, career change", synonyms: ["applications", "interviews", "resume", "career change"] },

  // --- Health ---
  { id: "health.sleep", label: "sleep", description: "Sleep quality, insomnia, naps, bedtime, rest", synonyms: ["rest", "tired", "insomnia", "nap"] },
  { id: "health.exercise", label: "exercise", description: "Exercise, workout, fitness, training", synonyms: ["workout", "fitness", "training", "physical activity"] },
  { id: "health.walking", label: "walking", description: "Walking, steps, stroll, hiking, getting outside", synonyms: ["steps", "stroll", "hike", "walk"] },
  { id: "health.running", label: "running", description: "Running, jogging, run, cardio, pace", synonyms: ["jogging", "jog", "cardio", "pace"] },
  { id: "health.gym", label: "gym", description: "Gym session, weight training, strength workout", synonyms: ["weights", "strength", "lifting", "iron"] },
  { id: "health.yoga", label: "yoga", description: "Yoga practice, stretching, flexibility, poses", synonyms: ["stretching", "flexibility", "poses", "mat"] },
  { id: "health.injury", label: "injury", description: "Injury, hurt, pain, sprain, strain", synonyms: ["hurt", "pain", "sprain", "strain"] },
  { id: "health.recovery", label: "recovery", description: "Recovering from injury, healing, getting better", synonyms: ["healing", "getting better", "resting", "rehab"] },
  { id: "health.doctor", label: "doctor", description: "Doctor visit, medical appointment, check-up, specialist", synonyms: ["medical", "appointment", "check-up", "clinic"] },
  { id: "health.medication", label: "medication", description: "Medication, pills, prescription, supplements", synonyms: ["pills", "prescription", "supplements", "medicine"] },
  { id: "health.diet", label: "diet", description: "Diet, eating habits, nutrition, food choices", synonyms: ["nutrition", "food", "eating", "meals"] },
  { id: "health.hydration", label: "hydration", description: "Water intake, hydration, drinking water", synonyms: ["water", "drinking", "fluids", "thirst"] },

  // --- Mental & Emotional State ---
  { id: "emotion.happiness", label: "happiness", description: "Happiness, feeling good, content, satisfied", synonyms: ["content", "satisfied", "pleased", "cheerful"] },
  { id: "emotion.joy", label: "joy", description: "Joy, delight, elation, pure happiness", synonyms: ["delight", "elation", "bliss", "ecstasy"] },
  { id: "emotion.excitement", label: "excitement", description: "Excitement, anticipation, thrilled, eager", synonyms: ["anticipation", "thrilled", "eager", "pumped"] },
  { id: "emotion.calm", label: "calm", description: "Feeling calm, peaceful, relaxed, at ease", synonyms: ["peaceful", "relaxed", "serene", "at ease"] },
  { id: "emotion.gratitude", label: "gratitude", description: "Feeling grateful, thankful, appreciation", synonyms: ["thankful", "appreciation", "blessed", "grateful"] },
  { id: "emotion.pride", label: "pride", description: "Feeling proud, accomplished, satisfied with achievement", synonyms: ["accomplished", "satisfied", "achievement", "triumph"] },
  { id: "emotion.hope", label: "hope", description: "Feeling hopeful, optimistic, looking forward", synonyms: ["optimistic", "looking forward", "positive outlook", "expectant"] },
  { id: "emotion.love", label: "love", description: "Feeling love, affection, deep care, warmth", synonyms: ["affection", "care", "warmth", "devotion"] },
  { id: "emotion.anxiety", label: "anxiety", description: "Anxiety, worry, nervousness, overthinking, dread", synonyms: ["worry", "nervous", "overthinking", "dread"] },
  { id: "emotion.stress", label: "stress", description: "Stress, pressure, overwhelm, burnout, tension", synonyms: ["pressure", "overwhelmed", "burnout", "tense"] },
  { id: "emotion.frustration", label: "frustration", description: "Frustration, annoyance, irritation, impatience", synonyms: ["annoyed", "irritated", "impatient", "aggravated"] },
  { id: "emotion.anger", label: "anger", description: "Anger, fury, rage, outrage, mad", synonyms: ["fury", "rage", "outrage", "mad"] },
  { id: "emotion.sadness", label: "sadness", description: "Sadness, feeling down, melancholy, low mood", synonyms: ["down", "melancholy", "low mood", "blue"] },
  { id: "emotion.loneliness", label: "loneliness", description: "Loneliness, feeling isolated, missing people, disconnected", synonyms: ["isolated", "alone", "disconnected", "missing someone"] },
  { id: "emotion.boredom", label: "boredom", description: "Boredom, restlessness, lack of stimulation, monotony", synonyms: ["restless", "unstimulated", "monotony", "dull"] },
  { id: "emotion.overwhelm", label: "overwhelm", description: "Feeling overwhelmed, too much, can't cope, swamped", synonyms: ["swamped", "too much", "can't cope", "drowning"] },
  { id: "emotion.relief", label: "relief", description: "Relief, weight off shoulders, finally done, exhale", synonyms: ["weight off", "finally done", "exhale", "unburdened"] },

  // --- Personal Reflection ---
  { id: "reflection.insight", label: "insight", description: "Insight, aha moment, new understanding, clarity", synonyms: ["aha moment", "epiphany", "clarity", "understanding"] },
  { id: "reflection.realization", label: "realization", description: "Realization, noticing something new, becoming aware", synonyms: ["noticed", "aware", "dawned on me", "figured out"] },
  { id: "reflection.decision", label: "decision", description: "Making a decision, choosing, committing to something", synonyms: ["choosing", "committing", "resolved", "decided"] },
  { id: "reflection.reflection", label: "reflection", description: "Self-reflection, looking inward, journaling about self", synonyms: ["self-reflection", "looking inward", "contemplation", "introspection"] },
  { id: "reflection.growth", label: "growth", description: "Personal growth, development, becoming better", synonyms: ["development", "improvement", "evolving", "maturing"] },
  { id: "reflection.mindset", label: "mindset", description: "Mindset shift, mental framework, perspective change", synonyms: ["perspective", "mental framework", "attitude", "outlook"] },
  { id: "reflection.values", label: "values", description: "Values, principles, what matters, moral compass", synonyms: ["principles", "morals", "beliefs", "ethics"] },
  { id: "reflection.purpose", label: "purpose", description: "Sense of purpose, meaning, direction, why", synonyms: ["meaning", "direction", "mission", "calling"] },
  { id: "reflection.identity", label: "identity", description: "Identity, who I am, self-image, sense of self", synonyms: ["who I am", "self-image", "sense of self", "persona"] },
  { id: "reflection.self-doubt", label: "self-doubt", description: "Self-doubt, imposter syndrome, questioning abilities", synonyms: ["imposter syndrome", "questioning", "insecurity", "uncertain"] },
  { id: "reflection.confidence", label: "confidence", description: "Confidence, self-assurance, belief in self", synonyms: ["self-assurance", "belief", "self-esteem", "bold"] },

  // --- Activities ---
  { id: "activity.reading", label: "reading", description: "Reading books, articles, long-form content", synonyms: ["book", "article", "literature", "pages"] },
  { id: "activity.writing", label: "writing", description: "Writing, drafting, blogging, composing text", synonyms: ["drafting", "blogging", "composing", "authoring"] },
  { id: "activity.studying", label: "studying", description: "Studying, reviewing material, exam prep, coursework", synonyms: ["reviewing", "exam prep", "coursework", "cramming"] },
  { id: "activity.cooking", label: "cooking", description: "Cooking, baking, preparing meals, recipes", synonyms: ["baking", "meal prep", "recipes", "kitchen"] },
  { id: "activity.cleaning", label: "cleaning", description: "Cleaning, tidying up, organizing, decluttering", synonyms: ["tidying", "organizing", "decluttering", "mopping"] },
  { id: "activity.shopping", label: "shopping", description: "Shopping, buying things, errands, stores", synonyms: ["buying", "errands", "stores", "purchases"] },
  { id: "activity.entertainment", label: "entertainment", description: "Entertainment, fun, leisure, recreation", synonyms: ["fun", "leisure", "recreation", "amusement"] },
  { id: "activity.gaming", label: "gaming", description: "Gaming, video games, board games, playing", synonyms: ["video games", "board games", "playing", "console"] },
  { id: "activity.watching-tv", label: "watching-tv", description: "Watching TV, shows, series, streaming", synonyms: ["shows", "series", "streaming", "binge"] },
  { id: "activity.movie", label: "movie", description: "Movie, film, cinema, watching a film", synonyms: ["film", "cinema", "theater", "screening"] },
  { id: "activity.music", label: "music", description: "Listening to or playing music, concerts, songs", synonyms: ["songs", "concert", "playlist", "album"] },
  { id: "activity.art", label: "art", description: "Art, drawing, painting, creative visual work", synonyms: ["drawing", "painting", "creative", "sketch"] },
  { id: "activity.photography", label: "photography", description: "Photography, taking photos, camera, editing", synonyms: ["photos", "camera", "editing", "shots"] },

  // --- Social Interaction ---
  { id: "social.conversation", label: "conversation", description: "Conversation, deep talk, discussion, chat", synonyms: ["deep talk", "discussion", "chat", "dialogue"] },
  { id: "social.argument", label: "argument", description: "Argument, fight, heated discussion, disagreement", synonyms: ["fight", "heated", "disagreement", "clash"] },
  { id: "social.conflict", label: "conflict", description: "Conflict, tension, difficult interaction, friction", synonyms: ["tension", "friction", "difficult", "dispute"] },
  { id: "social.reconciliation", label: "reconciliation", description: "Reconciliation, making up, resolving conflict, peace", synonyms: ["making up", "resolving", "peace", "forgiveness"] },
  { id: "social.support", label: "support", description: "Giving or receiving support, help, encouragement", synonyms: ["help", "encouragement", "backing", "comfort"] },
  { id: "social.kindness", label: "kindness", description: "Act of kindness, generosity, thoughtfulness", synonyms: ["generosity", "thoughtfulness", "goodwill", "compassion"] },
  { id: "social.gratitude-to-someone", label: "gratitude-to-someone", description: "Gratitude toward a specific person, thanking someone", synonyms: ["thanking", "appreciating someone", "acknowledging", "recognition"] },
  { id: "social.celebration", label: "celebration", description: "Celebration, festivity, commemorating, rejoicing", synonyms: ["festivity", "commemorating", "rejoicing", "toasting"] },

  // --- Events ---
  { id: "event.birthday", label: "birthday", description: "Birthday, birthday party, turning a year older", synonyms: ["birthday party", "celebration", "cake", "presents"] },
  { id: "event.holiday", label: "holiday", description: "Holiday, public holiday, day off, festive occasion", synonyms: ["public holiday", "day off", "festive", "bank holiday"] },
  { id: "event.anniversary", label: "anniversary", description: "Anniversary, commemoration, yearly milestone", synonyms: ["commemoration", "yearly", "special date", "remembrance"] },
  { id: "event.party", label: "party", description: "Party, get-together, social event, celebration", synonyms: ["get-together", "social event", "bash", "gathering"] },
  { id: "event.wedding", label: "wedding", description: "Wedding, marriage ceremony, nuptials", synonyms: ["marriage", "ceremony", "nuptials", "vows"] },
  { id: "event.funeral", label: "funeral", description: "Funeral, memorial, loss, mourning, grief", synonyms: ["memorial", "loss", "mourning", "grief"] },
  { id: "event.milestone", label: "milestone", description: "Life milestone, major event, significant moment", synonyms: ["major event", "significant moment", "turning point", "landmark"] },

  // --- Environment ---
  { id: "env.workplace", label: "workplace", description: "Being at the office, workplace environment, desk", synonyms: ["office", "desk", "coworking", "studio"] },
  { id: "env.outdoors", label: "outdoors", description: "Being outdoors, outside, fresh air, nature", synonyms: ["outside", "fresh air", "nature", "open air"] },
  { id: "env.park", label: "park", description: "Park, garden, green space, playground", synonyms: ["garden", "green space", "playground", "bench"] },
  { id: "env.nature", label: "nature", description: "Nature, wilderness, forest, mountains, lake", synonyms: ["wilderness", "forest", "mountains", "lake"] },
  { id: "env.city", label: "city", description: "City, urban, downtown, streets, town", synonyms: ["urban", "downtown", "streets", "metropolitan"] },
  { id: "env.travel-location", label: "travel-location", description: "Travel destination, new place, foreign location", synonyms: ["destination", "new place", "abroad", "foreign"] },
  { id: "env.weather", label: "weather", description: "Weather conditions, rain, sunshine, cold, hot", synonyms: ["rain", "sunshine", "cold", "warm"] },

  // --- Life Logistics ---
  { id: "logistics.errands", label: "errands", description: "Errands, tasks outside home, pickups, drops", synonyms: ["tasks", "pickup", "drop-off", "run around"] },
  { id: "logistics.chores", label: "chores", description: "Household chores, cleaning, laundry, dishes", synonyms: ["cleaning", "laundry", "dishes", "housework"] },
  { id: "logistics.bills", label: "bills", description: "Bills, payments, invoices, financial obligations", synonyms: ["payments", "invoices", "dues", "expenses"] },
  { id: "logistics.budgeting", label: "budgeting", description: "Budgeting, financial planning, tracking spending", synonyms: ["financial planning", "tracking spending", "saving", "allocating"] },
  { id: "logistics.appointments", label: "appointments", description: "Appointments, scheduled visits, bookings", synonyms: ["scheduled", "visits", "bookings", "reservations"] },
  { id: "logistics.paperwork", label: "paperwork", description: "Paperwork, forms, documents, bureaucracy", synonyms: ["forms", "documents", "bureaucracy", "admin"] },
  { id: "logistics.maintenance", label: "maintenance", description: "Home or car maintenance, repairs, upkeep", synonyms: ["repairs", "upkeep", "fixing", "servicing"] },

  // --- Time Context ---
  { id: "time.morning", label: "morning", description: "Morning time, waking up, sunrise, start of day", synonyms: ["waking up", "sunrise", "early", "dawn"] },
  { id: "time.afternoon", label: "afternoon", description: "Afternoon time, midday, post-lunch, daytime", synonyms: ["midday", "post-lunch", "daytime", "noon"] },
  { id: "time.evening", label: "evening", description: "Evening time, after work, dinner time, sunset", synonyms: ["after work", "dinner time", "sunset", "dusk"] },
  { id: "time.night", label: "night", description: "Night time, late hours, before bed, darkness", synonyms: ["late", "before bed", "darkness", "midnight"] },
  { id: "time.weekend", label: "weekend", description: "Weekend, Saturday, Sunday, day off, free time", synonyms: ["Saturday", "Sunday", "day off", "free time"] },
  { id: "time.weekday", label: "weekday", description: "Weekday, work day, Monday through Friday", synonyms: ["work day", "Monday", "Tuesday", "Wednesday"] },

  // --- Meta / Journal Meaning ---
  { id: "meta.highlight", label: "highlight", description: "Day's highlight, best moment, peak experience", synonyms: ["best moment", "peak", "standout", "favorite part"] },
  { id: "meta.low-point", label: "low-point", description: "Low point, worst moment, nadir, tough part", synonyms: ["worst moment", "nadir", "tough part", "bad moment"] },
  { id: "meta.lesson", label: "lesson", description: "Lesson learned, takeaway, what I learned today", synonyms: ["takeaway", "learned", "moral", "realization"] },
  { id: "meta.challenge", label: "challenge", description: "Challenge faced, difficulty, obstacle, hard thing", synonyms: ["difficulty", "obstacle", "hard", "struggle"] },
  { id: "meta.experiment", label: "experiment", description: "Trying something new, experiment, test, exploration", synonyms: ["trying", "test", "exploration", "new approach"] },
  { id: "meta.goal", label: "goal", description: "Goal, target, objective, aspiration", synonyms: ["target", "objective", "aspiration", "aim"] },
  { id: "meta.habit", label: "habit", description: "Habit tracking, daily routines, streaks, consistency", synonyms: ["routine", "streak", "daily practice", "consistency"] },
  { id: "meta.progress", label: "progress", description: "Overall progress, getting closer, advancing toward goal", synonyms: ["advancing", "getting closer", "momentum", "forward"] },
];

/**
 * Combines label, description, and synonyms into a single string for embedding.
 * The format produces a natural, search-friendly text that captures semantic meaning.
 */
export function buildTagEmbeddingText(tag: TagDefinition): string {
  return `${tag.label}: ${tag.description}, ${tag.synonyms.join(", ")}`;
}
