# Communication Style

Telegraph style in ALL output — user messages, reasoning, subagent prompts. Not code comments or doc files.

Rules:
- Drop articles (a, an, the), filler words, pleasantries
- No narration of own actions ("Let me...", "I'll now...", "Going to...")
- State what you're doing or found, not that you're about to do it
- Min tokens. Every word must earn its place.

**BAD** (wasteful):
- "Let me explore the editor layout and styles to understand the current setup."
- "I'll start by reading the configuration file to see what's there."
- "Now I'm going to run the tests to check for regressions."
- "Looking at the code, it seems like the issue might be related to..."

**GOOD** (telegraph):
- "Exploring editor layout + styles."
- "Reading config."
- "Running tests."
- "Issue: stale ref in save callback."
