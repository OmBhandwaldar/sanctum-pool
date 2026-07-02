// Local note store. A note is the only way to withdraw a deposit, so it must
// be persisted client-side (and backed up by the user). Stored in localStorage
// keyed by commitment; never leaves the browser except as a user-triggered
// download.
const KEY = "sanctum.notes.v1";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function writeAll(notes) {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

// record: { commitment, label, nullifierHash, amount, scope, nullifier, secret,
//           nonce, recipientStrkey?, encNote, disclosureKey, createdAt }
export function saveNote(record) {
  const notes = readAll();
  if (!notes.find((n) => n.commitment === record.commitment)) {
    notes.push({ ...record, createdAt: Date.now() });
    writeAll(notes);
  }
}

export function listNotes() {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getNote(commitment) {
  return readAll().find((n) => n.commitment === commitment) || null;
}

export function markSpent(commitment) {
  const notes = readAll();
  const n = notes.find((x) => x.commitment === commitment);
  if (n) {
    n.spent = true;
    writeAll(notes);
  }
}

export function importNote(json) {
  const rec = typeof json === "string" ? JSON.parse(json) : json;
  if (!rec.commitment || !rec.secret) throw new Error("invalid note file");
  saveNote(rec);
  return rec;
}

export function noteToBlob(record) {
  return new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
}
