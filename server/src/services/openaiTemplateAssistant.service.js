/**
 * openaiTemplateAssistant.service.js
 * Step 04 — OpenAI Assistants API + Code Interpreter.
 *
 * Flow:
 *   1. buildPayloadZip(templateFiles, clientJson) → Buffer (ZIP containing all
 *      template files + injected client.json)
 *   2. sendToOpenAI(zipBuffer) → { threadId, runId, assistantId }
 *   3. pollForCompletion(threadId, runId) → { fileId } (result ZIP file id)
 *   4. downloadResultZip(fileId) → Buffer (the tailored ZIP)
 *   5. tailorTemplate(templateId, clientJson) → Buffer  (full pipeline)
 *
 * SECURITY: OPENAI_API_KEY is read from process.env only. Never logged or exposed.
 */

import AdmZip from 'adm-zip';
import OpenAI from 'openai';
import { getTemplateFiles, readTemplateFile } from './templateLibrary.service.js';

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error('OPENAI_API_KEY is not configured on this server.');
    err.status = 503;
    err.expose = true;
    throw err;
  }
  return new OpenAI({ apiKey: key });
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 120; // 6 minutes max

// ─── Step 1: build ZIP ────────────────────────────────────────────────────────

export async function buildPayloadZip(templateId, clientJson) {
  const files = await getTemplateFiles(templateId);
  if (!files.length) {
    const err = new Error(`Template "${templateId}" contains no files.`);
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const zip = new AdmZip();

  for (const file of files) {
    if (file.relativePath === 'template.json') continue;
    const downloaded = await readTemplateFile(file.path);
    zip.addFile(file.relativePath, downloaded.content);
  }

  zip.addFile('client.json', Buffer.from(JSON.stringify(clientJson, null, 2), 'utf8'));

  return zip.toBuffer();
}

// ─── Step 2: upload + create thread + run ────────────────────────────────────

export async function sendToOpenAI(zipBuffer) {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const uploadedFile = await client.files.create({
    file: new File([zipBuffer], 'template-payload.zip', { type: 'application/zip' }),
    purpose: 'assistants',
  });

  const assistant = await client.beta.assistants.create({
    name: 'RoxanneAI Template Builder',
    instructions: buildAssistantInstructions(),
    model,
    tools: [{ type: 'code_interpreter' }],
    tool_resources: {
      code_interpreter: { file_ids: [uploadedFile.id] },
    },
  });

  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: buildUserMessage(),
      },
    ],
  });

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
  });

  return {
    threadId: thread.id,
    runId: run.id,
    assistantId: assistant.id,
    uploadedFileId: uploadedFile.id,
  };
}

// ─── Step 3: poll until complete ─────────────────────────────────────────────

export async function pollForCompletion(threadId, runId) {
  const client = getClient();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const run = await client.beta.threads.runs.retrieve(threadId, runId);

    if (run.status === 'completed') {
      const messages = await client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
      const resultFileId = extractResultFileId(messages.data);
      if (!resultFileId) {
        const err = new Error('AI completed but no result ZIP file was found in the response.');
        err.status = 502;
        err.expose = true;
        throw err;
      }
      return { fileId: resultFileId };
    }

    if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
      const reason = run.last_error?.message || run.status;
      const err = new Error(`AI run ${run.status}: ${reason}`);
      err.status = 502;
      err.expose = true;
      throw err;
    }
  }

  const err = new Error('AI tailoring timed out after 6 minutes. Please try again.');
  err.status = 504;
  err.expose = true;
  throw err;
}

// ─── Step 4: download result ZIP ─────────────────────────────────────────────

export async function downloadResultZip(fileId) {
  const client = getClient();
  const response = await client.files.content(fileId);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Step 5: full pipeline ────────────────────────────────────────────────────

export async function tailorTemplate(templateId, clientJson) {
  const zipBuffer = await buildPayloadZip(templateId, clientJson);
  const { threadId, runId, assistantId, uploadedFileId } = await sendToOpenAI(zipBuffer);

  let resultBuffer;
  try {
    const { fileId } = await pollForCompletion(threadId, runId);
    resultBuffer = await downloadResultZip(fileId);
  } finally {
    // Clean up temporary OpenAI resources in the background — don't block response
    cleanupOpenAIResources(assistantId, uploadedFileId).catch(() => {});
  }

  return resultBuffer;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupOpenAIResources(assistantId, uploadedFileId) {
  const client = getClient();
  await Promise.allSettled([
    client.beta.assistants.del(assistantId),
    client.files.del(uploadedFileId),
  ]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAssistantInstructions() {
  return `You are RoxanneAI, a professional website customiser.

You will receive a ZIP file containing a complete website template plus a file called client.json.

Your task:
1. Unzip the archive.
2. Read client.json to learn the client's business details (name, industry, audience, offer, tone, colours, contact info, pages, domain preference).
3. Edit every HTML, CSS, JS, and JSON file in the template to replace placeholder content with the client's real information:
   - Replace brand name, business name, hero headings, and CTA labels.
   - Replace placeholder services/products descriptions with the client's actual offer.
   - Replace placeholder contact details with the client's contact info (email, phone, address).
   - Apply brand colours to relevant CSS colour values if brand colours were specified.
   - Match the tone and style of copy to the client's specified brand tone.
   - Preserve all file structure, layout, images, SVGs, and scripts exactly as they are.
   - Do NOT delete any files. Do NOT add new pages unless the client's pages list includes pages not present.
4. Re-zip all files (preserving the same directory structure) into a new ZIP.
5. Save the result ZIP as tailored-site.zip.
6. Output ONLY: "Done. Tailored site saved as tailored-site.zip." — nothing else.`;
}

function buildUserMessage() {
  return 'Please customise the website template using the client data in client.json and return the result as tailored-site.zip.';
}

function extractResultFileId(messages) {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const block of message.content || []) {
      if (block.type === 'tool_use' && block.name === 'code_interpreter') continue;
      if (block.type === 'image_file') continue;
      if (block.type === 'file_path') return block.file_path?.file_id || null;
    }
    // Also check attachments
    for (const attachment of message.attachments || []) {
      if (attachment.file_id) return attachment.file_id;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
