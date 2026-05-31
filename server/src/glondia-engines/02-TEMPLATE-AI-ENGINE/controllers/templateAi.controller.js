/**
 * Template AI Engine controller bridge.
 *
 * The route layer imports from here so public traffic enters the engine
 * boundary first. The legacy controller remains the implementation while
 * its handlers are split into smaller stages.
 */

export {
  templateAiController,
} from '../../../controllers/template-ai.controller.js';
