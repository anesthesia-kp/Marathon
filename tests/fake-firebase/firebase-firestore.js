// Test stand-in for https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js
//
// An in-memory database that behaves like real Firestore in the ways this
// app depends on:
//  - collections return documents in document-ID order (IDs look random,
//    exactly like Firestore auto-IDs, so insertion order is NOT preserved)
//  - batches are all-or-nothing
//  - updating a document that doesn't exist REJECTS (and so fails the whole
//    batch) -- the real-world cause of the "deleted shoe" bug
//  - increment() and serverTimestamp() sentinels
//  - onSnapshot listeners fire after every committed change
// Tests reach it through window.__fakeFirestore.

class Timestamp {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
}
class IncrementSentinel {
  constructor(n) { this.n = n; }
}
class ServerTimestampSentinel {}

class FakeFirestoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "FirebaseError";
  }
}

const store = new Map(); // full document path -> plain data object
const listeners = new Set(); // { colPath, next }
let clock = 0;

// Deterministic pseudo-random 20-character IDs (like Firestore auto-IDs).
let seed = 20261021;
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function newId() {
  let id = "";
  for (let i = 0; i < 20; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    id += ID_CHARS[seed % ID_CHARS.length];
  }
  return id;
}

function clone(v) {
  if (v instanceof Timestamp) return new Timestamp(v.ms);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = clone(val);
    return out;
  }
  return v;
}

function parentPath(path) {
  return path.slice(0, path.lastIndexOf("/"));
}

function docsIn(colPath) {
  const prefix = colPath + "/";
  return [...store.keys()]
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .sort() // Firestore returns documents ordered by ID
    .map((p) => makeSnapshotDoc(p));
}

function makeSnapshotDoc(path) {
  const data = store.get(path);
  return {
    id: path.slice(path.lastIndexOf("/") + 1),
    ref: { type: "doc", path, id: path.slice(path.lastIndexOf("/") + 1) },
    exists: () => data !== undefined,
    data: () => clone(data),
  };
}

function makeQuerySnapshot(colPath) {
  const docs = docsIn(colPath);
  return { docs, empty: docs.length === 0, size: docs.length };
}

function notify(changedPaths) {
  const cols = new Set(changedPaths.map(parentPath));
  listeners.forEach((l) => {
    if (cols.has(l.colPath)) {
      const snap = makeQuerySnapshot(l.colPath);
      setTimeout(() => l.next(snap), 0);
    }
  });
}

function resolveFields(existing, patch) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v instanceof IncrementSentinel) out[k] = (Number(existing[k]) || 0) + v.n;
    // Uses the page's clock (so tests can fix the date), always increasing so creation order is kept.
    else if (v instanceof ServerTimestampSentinel) out[k] = new Timestamp((clock = Math.max(Date.now(), clock + 1)));
    else out[k] = clone(v);
  }
  return out;
}

const control = (window.__fakeFirestore = {
  // Set to an error code (e.g. "permission-denied") to make the next write fail.
  failNextWrite: null,
  writeCount: 0,
  get(path) {
    const d = store.get(path);
    return d === undefined ? undefined : clone(d);
  },
  list(colPath) {
    return docsIn(colPath).map((d) => ({ id: d.id, ...d.data() }));
  },
  // Direct write that bypasses the app (to set up a scenario), then notifies.
  put(path, data) {
    store.set(path, clone(data));
    notify([path]);
  },
});

// All writes go through here: validated first, then applied atomically.
async function commit(ops) {
  await Promise.resolve();
  if (control.failNextWrite) {
    const code = control.failNextWrite;
    control.failNextWrite = null;
    throw new FakeFirestoreError(code, code === "permission-denied" ? "Missing or insufficient permissions." : code);
  }
  // Validate against the state as each op would see it.
  const exists = new Map();
  for (const op of ops) {
    const present = exists.has(op.path) ? exists.get(op.path) : store.has(op.path);
    if (op.kind === "update" && !present) {
      throw new FakeFirestoreError("not-found", `No document to update: ${op.path}`);
    }
    exists.set(op.path, op.kind !== "delete");
  }
  for (const op of ops) {
    if (op.kind === "delete") store.delete(op.path);
    else if (op.kind === "set") store.set(op.path, resolveFields({}, op.data));
    else store.set(op.path, resolveFields(store.get(op.path), op.data));
  }
  control.writeCount += 1;
  notify(ops.map((o) => o.path));
}

export function getFirestore() {
  return { type: "db" };
}
export function collection(db, ...segments) {
  return { type: "collection", path: segments.join("/") };
}
export function doc(parent, ...segments) {
  let path;
  if (parent && parent.type === "collection") {
    path = parent.path + "/" + (segments.length ? segments.join("/") : newId());
  } else {
    path = segments.join("/");
  }
  return { type: "doc", path, id: path.slice(path.lastIndexOf("/") + 1) };
}
export async function addDoc(colRef, data) {
  const ref = doc(colRef);
  await commit([{ kind: "set", path: ref.path, data }]);
  return ref;
}
export async function updateDoc(ref, data) {
  await commit([{ kind: "update", path: ref.path, data }]);
}
export async function deleteDoc(ref) {
  await commit([{ kind: "delete", path: ref.path }]);
}
export async function getDocs(colRef) {
  await Promise.resolve();
  return makeQuerySnapshot(colRef.path);
}
export function onSnapshot(colRef, next) {
  const l = { colPath: colRef.path, next };
  listeners.add(l);
  setTimeout(() => listeners.has(l) && next(makeQuerySnapshot(colRef.path)), 0);
  return () => listeners.delete(l);
}
export function writeBatch() {
  const ops = [];
  return {
    set(ref, data) { ops.push({ kind: "set", path: ref.path, data }); },
    update(ref, data) { ops.push({ kind: "update", path: ref.path, data }); },
    delete(ref) { ops.push({ kind: "delete", path: ref.path }); },
    commit() { return commit(ops); },
  };
}
export function increment(n) {
  return new IncrementSentinel(n);
}
export function serverTimestamp() {
  return new ServerTimestampSentinel();
}
