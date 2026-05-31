/**
 * Template + answers -> tailored preview pipeline.
 */

import { createDeploymentContext } from '../../00-SHARED/deploymentContext.js';
import { runStage as selectTemplate } from '../01-TEMPLATE-LIBRARY-MOUNTAIN/templateSelection.stage.js';
import { runStage as resolveTemplateSource } from '../02-TEMPLATE-SOURCE-MOUNTAIN/templateSource.stage.js';
import { runStage as collectBrief } from '../03-USER-BRIEF-MOUNTAIN/userQuestionnaire.stage.js';
import { runStage as tailorWithOpenAI } from '../04-AI-REFINEMENT-MOUNTAIN/openaiTailor.stage.js';
import { runStage as editTemplate } from '../05-TEMPLATE-EDITING-MOUNTAIN/templateModifier.stage.js';

export async function run(input = {}, context = null) {
  const ctx = context || createDeploymentContext({ ...input, sourceType: 'template' });
  ctx.input = { ...ctx.input, ...input };
  await selectTemplate(ctx);
  await resolveTemplateSource(ctx);
  await collectBrief(ctx);
  await tailorWithOpenAI(ctx);
  await editTemplate(ctx);
  return ctx;
}
