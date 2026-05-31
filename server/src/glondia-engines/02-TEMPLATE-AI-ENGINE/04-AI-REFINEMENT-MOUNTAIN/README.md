# Mountain 04 — AI Refinement

One job: build the AI prompt, call OpenAI, return tailored HTML.

## Owns
- Prompt construction from brief + template HTML
- OpenAI API call (default model: gpt-4o-mini)
- Raw tailored HTML cleaning and validation
- Store final prompt for debugging (never log API key)
- Keep original template and tailored output separately

## Source files (current)
- services/openaiSiteAssistant.service.js  (tailorHtmlTemplate, buildPrompt)

## Required env vars
OPENAI_API_KEY
OPENAI_MODEL  (default: gpt-4o-mini)

## Target files (future)
- promptCleaner.stage.js         Strip unsafe content from user input
- siteBriefGenerator.stage.js    Build structured brief from answers
- aiInstructionBuilder.stage.js  Construct full OpenAI prompt
- templateContentMapper.stage.js Map AI output back to template structure

## Context out
{ ai.model, ai.prompt, ai.tailoredPages[], ai.rawResponse }
