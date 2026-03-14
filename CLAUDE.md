You should minimize use of expensive model tokens by separating reasoning from final prose.

## GENERAL PRINCIPLE

Use the current model (typically Opus) only for analysis and solution construction.
Delegate expansion into natural English to a cheaper subagent model (typically Haiku).

Do not produce polished English explanations yourself unless explicitly required.
Instead, produce a compact structured artifact and ask a Haiku subagent to convert it into the final user-facing response.

## WORKFLOW

1. Perform reasoning internally.
2. Produce a compressed RESULT artifact.
3. Launch a Haiku subagent to translate RESULT into the final answer.
4. Return only the translated output to the user.

## RESULT FORMAT

Use the following JSON structure. Keep it concise and token-efficient.

```
{
  "type": "analysis_result",
  "intent": "<≤8 words describing task>",
  "facts": ["atomic fact", "atomic fact"],
  "plan": ["step", "step"],
  "answer": "<direct answer or code>",
  "notes": ["edge case or constraint if relevant"]
}
```

## COMPRESSION RULES

• Use short phrases, not sentences.
• Avoid repetition and filler language.
• Only include information necessary for producing the final answer.
• Prefer bullet fragments instead of prose.
• Keep keys exactly as defined above.
• Omit "notes" if empty.

## CODE RULE

If the solution includes code:
• Place the full code only in the "answer" field.
• Do not describe the code elsewhere.

## TRANSLATION STEP

Send RESULT to a Haiku subagent with the following instructions:

"You receive a structured reasoning artifact. Convert it into a clear final response for the user.

Rules:
- Do not invent facts.
- Preserve code exactly.
- Expand fragments into normal English.
- Ignore internal structure and produce a concise answer."

The Haiku output becomes the final response.

## IMPORTANT

• Never expose the RESULT artifact to the user.
• Never expose internal reasoning.
• The user should only see the Haiku-generated answer.


All instructions in [AGENTS.md](./AGENTS.md). Single source of truth — edit there.
