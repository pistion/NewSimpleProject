/**
 * deployResponse.middleware.js — final, consistent deploy response.
 *
 * Returns the deployment, billing result, collected warnings + steps. Keeps the
 * existing 202 status for queued/prepared deploys; a hard-failed record (the
 * pipeline returns a record rather than throwing) also responds 202 but with a
 * clear failed status + steps so the client can show the failure.
 */
export function sendDeployResponse(message) {
  return (req, res) => {
    const flow = req.deployFlow || {};
    const deployment = flow.deployment || {};
    const billing = flow.billing || null;

    res.status(202).json({
      data: { ...deployment, billing },
      billing,
      warnings: flow.warnings || [],
      steps: flow.steps || [],
      message: flow.responseMessage || message,
      requestId: req.id,
    });
  };
}

export default { sendDeployResponse };
