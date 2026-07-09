function ok(data, meta = {}) {
  return {
    ok: true,
    data,
    meta
  };
}

function created(data, meta = {}) {
  return {
    ok: true,
    status: 201,
    data,
    meta
  };
}

function deleted(data = null, meta = {}) {
  return {
    ok: true,
    status: 204,
    data,
    meta
  };
}

function fail(message, status = 400, details = null) {
  return {
    ok: false,
    status,
    error: {
      message,
      details
    }
  };
}

function notFound(entity, id) {
  return fail(`${entity} not found${id ? `: ${id}` : ''}`, 404);
}

function asHttpHandler(controllerFn) {
  return async function handler(req, res, next) {
    try {
      const result = await controllerFn({
        params: req.params || {},
        query: req.query || {},
        body: req.body || {},
        user: req.user || null,
        headers: req.headers || {}
      });
      const status = result.status || (result.ok === false ? 400 : 200);
      return res.status(status).json(result);
    } catch (error) {
      if (next) return next(error);
      return res.status(500).json(fail(error.message, 500));
    }
  };
}

module.exports = {
  ok,
  created,
  deleted,
  fail,
  notFound,
  asHttpHandler
};
