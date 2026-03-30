const state = new Map();

module.exports = {
  get: (id) => state.get(id),
  set: (id, data) => state.set(id, data),
  clear: (id) => state.delete(id)
};
