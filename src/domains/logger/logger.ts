enum LogLevel {
  INFO = 30,
  WARN = 40,
  ERROR = 50,
}

const COLORS = {
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  BLUE: "\x1b[34m",
  YELLOW: "\x1b[33m",
  RESET: "\x1b[0m",
}

export class Logger {
  metadata?: Record<string, unknown>

  constructor(private logEnabled: boolean) {}

  info(message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.INFO, message, metadata)
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.WARN, message, metadata)
  }

  error(message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, message, metadata)
  }

  private log(
    logLevel: LogLevel,
    message: string,
    logMetadata?: Record<string, unknown>
  ) {
    if (!this.logEnabled) {
      return
    }

    const log = this.formatStringifiedLog(logLevel, message)

    const hasMetadata =
      Object.keys({
        ...this.metadata,
        ...logMetadata,
      }).length > 0

    // eslint-disable-next-line no-console
    console.log(
      log,
      hasMetadata
        ? {
            ...this.metadata,
            ...logMetadata,
          }
        : ""
    )
  }

  private formatStringifiedLog(logLevel: LogLevel, message: string) {
    let prefix = ""

    switch (logLevel) {
      case LogLevel.WARN:
        prefix = formatColorString("YELLOW", "[WARN]")
        break
      case LogLevel.ERROR:
        prefix = formatColorString("RED", "[ERROR]")
        break
      default:
      case LogLevel.INFO:
        prefix = formatColorString("BLUE", "[INFO]")
        break
    }

    return `${prefix} ${message}`
  }
}

function formatColorString(color: keyof typeof COLORS, string: string) {
  return `${COLORS[color]}${string}${COLORS.RESET}`
}

export function createLogger(logEnabled: boolean = true) {
  return new Logger(logEnabled)
}

const logger = createLogger()

export default logger
