// A single initial slash belongs to the hub. The hub unwraps the agent tunnel.
export function isHubCommand(text) {
  return text.startsWith('/') && !text.startsWith('//');
}

export function commandName(text) {
  return text.slice(1).split(/[ \t\r\n]/u, 1)[0];
}
