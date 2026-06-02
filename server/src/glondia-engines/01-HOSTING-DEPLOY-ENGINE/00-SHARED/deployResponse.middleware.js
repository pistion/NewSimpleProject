/**
 * deployResponse.middleware.js - final deployment response serializer.
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
