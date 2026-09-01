// CLI argument parser for pnpm rivet:host.

export interface ParsedArgs {
  request?: string;
  requestFile?: string;
  db: string;
  project: string;
  port: number;
  waitForEditor: boolean;
  noRun: boolean;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedArgs {
  const args: ParsedArgs = {
    db: env.YOKE_DB_PATH ?? "./yoke.sqlite",
    project: "rivet/spec-creation.rivet-project",
    port: 21888,
    waitForEditor: false,
    noRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--request":
      case "-r":
        args.request = argv[++i];
        break;
      case "--request-file":
        args.requestFile = argv[++i];
        break;
      case "--db":
        args.db = argv[++i];
        break;
      case "--project":
        args.project = argv[++i];
        break;
      case "--port":
        args.port = parseInt(argv[++i], 10);
        break;
      case "--wait-for-editor":
        args.waitForEditor = true;
        break;
      case "--no-run":
        args.noRun = true;
        break;
    }
  }

  return args;
}
