/**
 * githubLinkValidation.controller.js - validate-only GitHub repo preview.
 */
export function validateGithubLinkOnly(req, res) {
  const gl = req.githubLink || {};
  res.status(200).json({
    data: {
      repoUrl: gl.repoUrl || null,
      owner: gl.owner || null,
      repo: gl.repo || null,
      branch: gl.branch || 'main',
      valid: true,
    },
    requestId: req.id,
  });
}

export default { validateGithubLinkOnly };
