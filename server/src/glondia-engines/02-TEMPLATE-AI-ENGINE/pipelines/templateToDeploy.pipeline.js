/**
 * Template site -> final source handoff pipeline helpers.
 */

import { generateViteStaticSiteFromTemplateSite } from '../07-HANDOFF-TO-HOSTING-MOUNTAIN/finalSourcePackager.stage.js';
import { publishGeneratedSiteToGitHub } from '../07-HANDOFF-TO-HOSTING-MOUNTAIN/generatedSitePublisher.stage.js';

export async function packageAndPublish(site, options = {}) {
  const generatedSite = await generateViteStaticSiteFromTemplateSite(site, options);
  const githubPublish = options.repoUrl
    ? await publishGeneratedSiteToGitHub({
      siteDir: generatedSite.siteDir,
      repoUrl: options.repoUrl,
      branch: options.branch || 'main',
      targetRoot: options.targetRoot || options.rootDirectory || '',
      commitMessage: options.commitMessage || `Publish Glondia Template AI site ${options.slug || site.siteId}`,
    })
    : { attempted: false, skippedReason: 'No repoUrl supplied.' };

  return { generatedSite, githubPublish };
}
