/**
 * crmToolRegistry.js
 * MCP tool layer — registers all available CRM tools.
 * Add new tools here by requiring and pushing to the TOOLS array.
 */

const facebookPost = require('./tools/facebookPost.tool');
const linkedInPost = require('./tools/linkedInPost.tool');
const sendEmail    = require('./tools/sendEmail.tool');

const TOOLS = [sendEmail, facebookPost, linkedInPost];

function listTools() {
  return TOOLS.map((t) => ({
    id:                 t.id,
    name:               t.name,
    provider:           t.provider,
    requiresConnection: t.requiresConnection,
    description:        t.description,
    parameters:         t.parameters,
  }));
}

function getTool(id) {
  return TOOLS.find((t) => t.id === id) || null;
}

module.exports = { listTools, getTool };
