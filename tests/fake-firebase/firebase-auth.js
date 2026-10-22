// Test stand-in for https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js
// Starts signed out; "Sign in with Google" signs in a fixed test user.
const TEST_USER = { uid: "test-user", email: "runner@example.com", displayName: "Test Runner" };
const listeners = new Set();
let currentUser = null;

const control = (window.__fakeAuth = { failSignIn: null, user: () => currentUser });

function notify() {
  listeners.forEach((cb) => cb(currentUser));
}

export function getAuth(app) {
  return { app };
}
export class GoogleAuthProvider {}
export async function signInWithPopup() {
  if (control.failSignIn) throw new Error(control.failSignIn);
  currentUser = TEST_USER;
  setTimeout(notify, 0);
  return { user: TEST_USER };
}
export async function signOut() {
  currentUser = null;
  setTimeout(notify, 0);
}
export function onAuthStateChanged(auth, cb) {
  listeners.add(cb);
  setTimeout(() => cb(currentUser), 0);
  return () => listeners.delete(cb);
}
