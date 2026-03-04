export type TimePeriod = "morning" | "afternoon" | "evening" | "night";

export type Season = "spring" | "summer" | "fall" | "winter";

export interface JournalingPrompt {
  text: string;
  periods: TimePeriod[];
  seasons?: Season[];
  weekendOnly?: boolean;
  weekdayOnly?: boolean;
}

export const JOURNALING_PROMPTS: JournalingPrompt[] = [
  // ── Universal / any time ──────────────────────────────────────────
  {
    text: "What's on your mind?",
    periods: ["morning", "afternoon", "evening", "night"],
  },
  {
    text: "What are you grateful for right now?",
    periods: ["morning", "afternoon", "evening", "night"],
  },
  {
    text: "How are you feeling right now?",
    periods: ["morning", "afternoon", "evening", "night"],
  },
  {
    text: "What did you appreciate about your environment?",
    periods: ["morning", "afternoon", "evening", "night"],
  },

  // ── Morning ───────────────────────────────────────────────────────
  {
    text: "What would make today meaningful?",
    periods: ["morning", "afternoon"],
  },
  {
    text: "What are you looking forward to today?",
    periods: ["morning"],
  },
  {
    text: "What's your intention for today?",
    periods: ["morning"],
  },
  {
    text: "What energy are you bringing into today?",
    periods: ["morning"],
  },
  {
    text: "What's one thing you'd like to accomplish today?",
    periods: ["morning", "afternoon"],
  },
  {
    text: "How did you sleep?",
    periods: ["morning"],
  },
  {
    text: "What's the first thing on your mind this morning?",
    periods: ["morning"],
  },
  {
    text: "What deserves your attention today?",
    periods: ["morning"],
  },
  {
    text: "What is the single most important thing today?",
    periods: ["morning"],
  },
  {
    text: "What mood do you wake up with?",
    periods: ["morning"],
  },
  {
    text: "What does your body feel like right now?",
    periods: ["morning"],
  },
  {
    text: "What thought is already present this morning?",
    periods: ["morning"],
  },
  {
    text: "What would make today successful?",
    periods: ["morning"],
  },
  {
    text: "What would make today peaceful?",
    periods: ["morning"],
  },
  {
    text: "What might challenge you today?",
    periods: ["morning"],
  },
  {
    text: "What habit do you want to practice today?",
    periods: ["morning"],
  },
  {
    text: "What intention will guide your actions today?",
    periods: ["morning"],
  },
  {
    text: "What deserves your attention early rather than later?",
    periods: ["morning"],
  },
  {
    text: "What would you like to notice more today?",
    periods: ["morning"],
  },

  // ── Afternoon / midday ────────────────────────────────────────────
  {
    text: "How's your day going so far?",
    periods: ["afternoon"],
  },
  {
    text: "What's been the best part of today?",
    periods: ["afternoon", "evening"],
  },
  {
    text: "What surprised you today?",
    periods: ["afternoon", "evening"],
  },
  {
    text: "What did you learn today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What moment today felt most alive?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What small decision shaped your day?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "How has your energy changed since morning?",
    periods: ["afternoon"],
  },
  {
    text: "What has gone better than expected so far?",
    periods: ["afternoon"],
  },
  {
    text: "What has been frustrating so far?",
    periods: ["afternoon"],
  },
  {
    text: "What task is currently most important?",
    periods: ["afternoon"],
  },
  {
    text: "What distraction has appeared today?",
    periods: ["afternoon"],
  },
  {
    text: "What conversation affected your mood?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What detail of the day stands out right now?",
    periods: ["afternoon"],
  },
  {
    text: "What would help you reset for the afternoon?",
    periods: ["afternoon"],
  },
  {
    text: "What have you done well so far today?",
    periods: ["afternoon"],
  },
  {
    text: "What are you postponing right now?",
    periods: ["afternoon"],
  },
  {
    text: "What environment are you in, and how does it affect you?",
    periods: ["afternoon"],
  },

  // ── Evening ───────────────────────────────────────────────────────
  {
    text: "How was your day?",
    periods: ["evening", "night"],
  },
  {
    text: "What made you smile today?",
    periods: ["evening", "night"],
  },
  {
    text: "What's something you did well today?",
    periods: ["evening", "night"],
  },
  {
    text: "What are you letting go of today?",
    periods: ["evening", "night"],
  },
  {
    text: "How do you want to feel tomorrow?",
    periods: ["evening", "night"],
  },
  {
    text: "What challenged you today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What are you taking with you into tomorrow?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you avoid today, and why?",
    periods: ["evening", "night"],
  },
  {
    text: "What drained your energy?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What gave you energy?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What thought repeated the most today?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you learn about yourself today?",
    periods: ["evening", "night"],
  },
  {
    text: "What tension did you carry in your body?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "When did you feel calm today?",
    periods: ["evening", "night"],
  },
  {
    text: "What expectation did reality contradict today?",
    periods: ["evening", "night"],
  },
  {
    text: "What detail would most people overlook today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What did you postpone that matters?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What felt meaningful today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What felt pointless today?",
    periods: ["evening", "night"],
  },
  {
    text: "What conversation stayed with you?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What did you notice about your mood patterns?",
    periods: ["evening", "night"],
  },
  {
    text: "What desire influenced your actions today?",
    periods: ["evening", "night"],
  },
  {
    text: "What fear influenced your actions today?",
    periods: ["evening", "night"],
  },
  {
    text: "What was the most beautiful thing you saw?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What idea appeared briefly but was interesting?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What irritated you more than it should have?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What habit showed up today?",
    periods: ["evening", "night"],
  },
  {
    text: "What would you do differently if you repeated today?",
    periods: ["evening", "night"],
  },
  {
    text: "What felt effortless today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What felt unnecessarily difficult?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What did you notice about time passing today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What emotion was strongest today?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you ignore that deserves attention?",
    periods: ["evening", "night"],
  },
  {
    text: "What unfinished thought remains from today?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you create today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What environment affected your mood most?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What risk did you take today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What pattern from the past reappeared today?",
    periods: ["evening", "night"],
  },
  {
    text: "What would you title today if it were a book chapter?",
    periods: ["evening", "night"],
  },
  {
    text: "What did today teach you about patience?",
    periods: ["evening", "night"],
  },
  {
    text: "What deserves attention tomorrow?",
    periods: ["evening", "night"],
  },
  {
    text: "What problem occupied your mind the most?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What question about life came up today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What's something you noticed today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What's one thing you want to remember about today?",
    periods: ["afternoon", "evening", "night"],
  },
  {
    text: "What moment defined the day?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you accomplish today?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you struggle with today?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you notice about your reactions?",
    periods: ["evening", "night"],
  },
  {
    text: "What interaction mattered most today?",
    periods: ["evening", "night"],
  },
  {
    text: "What would you repeat from today?",
    periods: ["evening", "night"],
  },
  {
    text: "What emotion stayed with you longest today?",
    periods: ["evening", "night"],
  },
  {
    text: "What did you neglect today?",
    periods: ["evening", "night"],
  },
  {
    text: "What deserves appreciation from today?",
    periods: ["evening", "night"],
  },

  // ── Late night / reflection ───────────────────────────────────────
  {
    text: "What's on your mind before bed?",
    periods: ["night"],
  },
  {
    text: "What thought remains unresolved tonight?",
    periods: ["night"],
  },
  {
    text: "What are you still thinking about before sleep?",
    periods: ["night"],
  },
  {
    text: "What tension is still in your body?",
    periods: ["night"],
  },
  {
    text: "What can you let go of from today?",
    periods: ["night"],
  },
  {
    text: "What did today reveal about your priorities?",
    periods: ["night"],
  },
  {
    text: "What did today reveal about your habits?",
    periods: ["night"],
  },
  {
    text: "What would you tell your morning self now?",
    periods: ["night"],
  },
  {
    text: "What is one insight from today worth remembering?",
    periods: ["night"],
  },
  {
    text: "What small win did you overlook?",
    periods: ["night"],
  },
  {
    text: "What deserves gratitude tonight?",
    periods: ["night"],
  },
  {
    text: "What are you curious about tomorrow?",
    periods: ["night"],
  },
  {
    text: "What intention will you carry into the next day?",
    periods: ["night"],
  },

  // ── Weekend ───────────────────────────────────────────────────────
  {
    text: "What's your plan for a restful day?",
    periods: ["morning", "afternoon"],
    weekendOnly: true,
  },
  {
    text: "How are you spending your time off?",
    periods: ["morning", "afternoon", "evening"],
    weekendOnly: true,
  },
  {
    text: "What's something fun you did today?",
    periods: ["afternoon", "evening"],
    weekendOnly: true,
  },
  {
    text: "What made this weekend feel different from weekdays?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What did you do purely because you wanted to?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What slowed you down this weekend?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What did you notice when you had more time?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What part of the weekend felt most restorative?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What did you do that your weekday self rarely does?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What place did you visit or explore?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What conversation stood out this weekend?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What did you learn about how you rest?",
    periods: ["evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What did you create or build this weekend?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What distracted you from resting?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What hobby or curiosity did you follow?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What did you observe about your pace of life?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What would make next weekend better?",
    periods: ["evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What did you do with your hands this weekend?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What moment felt simple and complete?",
    periods: ["afternoon", "evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What unfinished thought will carry into the week?",
    periods: ["evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What intention do you want to bring into Monday?",
    periods: ["evening", "night"],
    weekendOnly: true,
  },
  {
    text: "What memory from this weekend will stay with you?",
    periods: ["evening", "night"],
    weekendOnly: true,
  },

  // ── Weekday ───────────────────────────────────────────────────────
  {
    text: "What's on your plate at work today?",
    periods: ["morning"],
    weekdayOnly: true,
  },
  {
    text: "What's the most important thing to get done today?",
    periods: ["morning", "afternoon"],
    weekdayOnly: true,
  },

  // ── Spring ───────────────────────────────────────────────────────
  {
    text: "What in your life currently feels like a beginning?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring"],
  },
  {
    text: "What idea is starting to take shape?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring"],
  },
  {
    text: "What habit would you like to plant this season?",
    periods: ["morning", "afternoon"],
    seasons: ["spring"],
  },
  {
    text: "What in your environment is changing right now?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring"],
  },
  {
    text: "What feels fresh or renewed in your life?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring"],
  },
  {
    text: "What have you outgrown recently?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["spring"],
  },
  {
    text: "What small sign of growth did you notice today?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["spring"],
  },
  {
    text: "What possibility excites you this spring?",
    periods: ["morning", "afternoon"],
    seasons: ["spring"],
  },
  {
    text: "What would you like to nurture more carefully?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring"],
  },
  {
    text: "What energy returns to you with longer days?",
    periods: ["morning", "afternoon"],
    seasons: ["spring"],
  },
  {
    text: "What project deserves a first step?",
    periods: ["morning", "afternoon"],
    seasons: ["spring"],
  },
  {
    text: "What does starting again mean to you now?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring"],
  },

  // ── Summer ──────────────────────────────────────────────────────
  {
    text: "What activity makes you feel most alive in summer?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["summer"],
  },
  {
    text: "What part of the day feels most expansive?",
    periods: ["afternoon", "evening"],
    seasons: ["summer"],
  },
  {
    text: "What place do you want to spend more time in?",
    periods: ["morning", "afternoon"],
    seasons: ["summer"],
  },
  {
    text: "What sensory detail defines today?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["summer"],
  },
  {
    text: "What experience do you want to fully savor?",
    periods: ["morning", "afternoon"],
    seasons: ["summer"],
  },
  {
    text: "What social moment stands out today?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["summer"],
  },
  {
    text: "What feels abundant right now?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["summer"],
  },
  {
    text: "What does a perfect summer day look like to you?",
    periods: ["morning", "afternoon"],
    seasons: ["summer"],
  },
  {
    text: "What rhythm does your life fall into during summer?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["summer"],
  },
  {
    text: "What adventure would you like to take this season?",
    periods: ["morning", "afternoon"],
    seasons: ["summer"],
  },
  {
    text: "What moment today felt carefree?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["summer"],
  },
  {
    text: "What do long evenings invite you to reflect on?",
    periods: ["evening", "night"],
    seasons: ["summer"],
  },

  // ── Fall ────────────────────────────────────────────────────────
  {
    text: "What in your life is ready to be completed?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What are you harvesting from earlier efforts?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What habit or commitment deserves evaluation?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What have you learned this year so far?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What feels mature or settled in your life?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What are you ready to let go of?",
    periods: ["evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What memory surfaced while noticing the season change?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What routine becomes more important as days shorten?",
    periods: ["morning", "afternoon"],
    seasons: ["fall"],
  },
  {
    text: "What work requires focus now?",
    periods: ["morning", "afternoon"],
    seasons: ["fall"],
  },
  {
    text: "What quiet moment defined today?",
    periods: ["evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What do you want to preserve from this year?",
    periods: ["evening", "night"],
    seasons: ["fall"],
  },
  {
    text: "What transition are you currently experiencing?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["fall"],
  },

  // ── Winter ──────────────────────────────────────────────────────
  {
    text: "What does rest mean for you right now?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What feels quiet or slowed down in your life?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What thought keeps returning during still moments?",
    periods: ["evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What do you reflect on more in winter?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What comfort do you appreciate most today?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What inner work calls for attention?",
    periods: ["afternoon", "evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What memory surfaced during a quiet evening?",
    periods: ["evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What does darkness or cold invite you to consider?",
    periods: ["evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What idea deserves deeper contemplation this season?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What part of yourself needs patience right now?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What silence revealed something today?",
    periods: ["evening", "night"],
    seasons: ["winter"],
  },
  {
    text: "What intention will you carry through the winter?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["winter"],
  },

  // ── Seasonal transitions ───────────────────────────────────────
  {
    text: "What change in the air or light did you notice today?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring", "summer", "fall", "winter"],
  },
  {
    text: "What season of your life does this moment resemble?",
    periods: ["morning", "afternoon", "evening", "night"],
    seasons: ["spring", "summer", "fall", "winter"],
  },
];

export const PAST_EMPTY_MESSAGES: string[] = [
  "Nothing here \u2014 it was probably a busy day!",
  "This day slipped by without a note",
  "Some days are best lived, not written about",
  "A quiet day in the journal",
  "This page stayed blank \u2014 and that's okay",
  "No words captured, but the day still happened",
  "Sometimes silence is the best entry",
  "An unwritten day, full of its own stories",
  "The pen rested on this one",
  "Not every day needs to be documented",
];

export const FUTURE_EMPTY_MESSAGES: string[] = [
  "This day hasn't happened yet!",
  "The page is waiting for this day to arrive",
  "A blank canvas for a day yet to come",
  "This story hasn't been written yet",
  "Still in the future \u2014 check back later!",
  "Nothing to see here yet \u2014 this day is still ahead",
  "The ink hasn't dried on this day yet",
  "A day waiting to unfold",
  "Tomorrow's pages are always empty",
  "This day is still on its way",
];
