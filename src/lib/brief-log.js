// One JSON line per significant briefing event, on stdout, which Railway collects.
// No metrics backend, no dependency.
//
// Never log transcript bodies or proof.detail: a session id is a bearer token for the
// conversation and the brief can carry a real customer quote.

export function log(evt, fields = {}) {
  const line = { evt, at: new Date().toISOString(), ...fields };
  process.stdout.write(JSON.stringify(line) + "\n");
}

export default log;
