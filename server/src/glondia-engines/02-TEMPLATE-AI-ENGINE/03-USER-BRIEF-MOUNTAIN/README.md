# Mountain 03 — User Brief

One job: run the questionnaire, collect answers, validate required fields.

## Owns
- Multi-step questionnaire (9 questions currently)
- Required fields: businessName, industry, offer
- In-memory session state (templateId, collectedAnswers, step)
- Asset collection (future)

## Current questions
businessName, industry, audience, offer, tone, colors,
contactEmail, contactPhone, contactAddress, pages, domain

## Source files (current)
- services/openaiSiteAssistant.service.js  (INTAKE_QUESTIONS, REQUIRED_KEYS)
- controllers/template-ai.controller.js    (intake start/message handlers)

## Target files (future)
- userQuestionnaire.stage.js     Question flow + session management
- businessDataCollector.stage.js  Required field validation
- userPromptCollector.stage.js    Free-form user prompts
- assetCollector.stage.js         (future) Logo/image upload

## Context out
{ brief: { businessName, industry, audience, offer, tone, colors, ... } }
