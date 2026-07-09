const { buildInitialDatabase } = require('../db/build-initial-database');
const { nowIso } = require('../models');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInMemoryDatabase(initialData = buildInitialDatabase()) {
  const state = clone(initialData);

  function collection(name) {
    if (!Array.isArray(state[name])) {
      state[name] = [];
    }
    return state[name];
  }

  function all(name) {
    return collection(name);
  }

  function findById(name, id) {
    return collection(name).find((item) => item.id === id) || null;
  }

  function insert(name, record) {
    const rows = collection(name);
    if (record.id && rows.some((item) => item.id === record.id)) {
      throw new Error(`${name} record already exists: ${record.id}`);
    }
    rows.unshift(record);
    touchMeta();
    return record;
  }

  function update(name, id, updater) {
    const rows = collection(name);
    const index = rows.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const current = rows[index];
    const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
    rows[index] = next;
    touchMeta();
    return next;
  }

  function remove(name, id) {
    const rows = collection(name);
    const index = rows.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const [deleted] = rows.splice(index, 1);
    touchMeta();
    return deleted;
  }

  function query(name, predicate = () => true) {
    return collection(name).filter(predicate);
  }

  function snapshot() {
    return clone(state);
  }

  function reset(nextState = buildInitialDatabase()) {
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, clone(nextState));
    touchMeta();
    return snapshot();
  }

  function touchMeta() {
    state.meta = {
      ...(state.meta || {}),
      updatedAt: nowIso()
    };
  }

  return {
    state,
    all,
    findById,
    insert,
    update,
    remove,
    query,
    snapshot,
    reset
  };
}

module.exports = {
  createInMemoryDatabase
};
