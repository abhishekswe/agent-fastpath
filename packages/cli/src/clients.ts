/**
 * MCP client configuration snippets printed by `agent-fastpath install-config`.
 *
 * Every client runs the same stdio command; only the file location and JSON
 * shape differ. Keep docs/configuration.md in sync with this table.
 */

const NAME = 'agent-fastpath';
const KEY_PLACEHOLDER = '<your-typesafe-api-key>';
const COMMAND = 'npx';
const ARGS = ['-y', NAME, 'start'];
const ENV = { TYPESAFE_API_KEY: KEY_PLACEHOLDER };

/** One MCP client the CLI can print setup instructions for. */
export interface ClientConfig {
  /** Name passed to `install-config`. */
  id: string;
  /** Human-readable client name. */
  label: string;
  /** Setup instructions, ready to print. */
  render: () => string;
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** Standard `mcpServers` shape shared by most clients. */
const mcpServers = () => json({ mcpServers: { [NAME]: { command: COMMAND, args: ARGS, env: ENV } } });

const fileSnippet = (where: string, body: string): string => `${where}\n\n${body}`;

/** Supported clients, in the order `install-config --help` lists them. */
export const CLIENTS: ClientConfig[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    render: () => `claude mcp add ${NAME} -s user -e TYPESAFE_API_KEY=${KEY_PLACEHOLDER} -- ${COMMAND} ${ARGS.join(' ')}`
  },
  {
    id: 'codex',
    label: 'Codex',
    render: () =>
      fileSnippet(
        'Add to ~/.codex/config.toml:',
        [
          `[mcp_servers.${NAME}]`,
          `command = "${COMMAND}"`,
          `args = [${ARGS.map((a) => `"${a}"`).join(', ')}]`,
          `env = { TYPESAFE_API_KEY = "${KEY_PLACEHOLDER}" }`
        ].join('\n')
      )
  },
  { id: 'cursor', label: 'Cursor', render: () => fileSnippet('Add to ~/.cursor/mcp.json:', mcpServers()) },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    render: () => fileSnippet('Add to ~/.gemini/config/mcp_config.json, then restart Antigravity:', mcpServers())
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    render: () => `gemini mcp add -s user -e TYPESAFE_API_KEY=${KEY_PLACEHOLDER} ${NAME} ${COMMAND} ${ARGS.join(' ')}`
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    render: () =>
      fileSnippet(
        'Add to ~/.config/opencode/opencode.json:',
        json({
          $schema: 'https://opencode.ai/config.json',
          mcp: { [NAME]: { type: 'local', command: [COMMAND, ...ARGS], enabled: true, environment: ENV } }
        })
      )
  },
  {
    id: 'vscode',
    label: 'VS Code (GitHub Copilot)',
    render: () =>
      fileSnippet(
        'Add to .vscode/mcp.json in your workspace:',
        json({ servers: { [NAME]: { type: 'stdio', command: COMMAND, args: ARGS, env: ENV } } })
      )
  },
  {
    id: 'cline',
    label: 'Cline',
    render: () => fileSnippet('In Cline, open MCP Servers > Configure MCP Servers and add:', mcpServers())
  },
  {
    id: 'zed',
    label: 'Zed',
    render: () =>
      fileSnippet(
        'Add to your Zed settings.json:',
        json({ context_servers: { [NAME]: { command: COMMAND, args: ARGS, env: ENV } } })
      )
  },
  {
    id: 'amp',
    label: 'Amp',
    render: () =>
      fileSnippet(
        'Add to your Amp settings.json:',
        json({ 'amp.mcpServers': { [NAME]: { command: COMMAND, args: ARGS, env: ENV } } })
      )
  },
  {
    id: 'pi',
    label: 'Pi',
    render: () =>
      fileSnippet(
        'Pi reads MCP servers through pi-mcp-adapter. Install it with `pi install npm:pi-mcp-adapter`, then add to ~/.pi/agent/mcp.json:',
        mcpServers()
      )
  },
  {
    id: 'generic',
    label: 'Any other MCP client (Claude Desktop, Kiro, Warp, Kilo Code, Roo Code)',
    render: () => fileSnippet("Add to your client's MCP config file:", mcpServers())
  }
];

/** Looks up a client by its `install-config` id. */
export function findClient(id: string): ClientConfig | undefined {
  return CLIENTS.find((c) => c.id === id);
}
