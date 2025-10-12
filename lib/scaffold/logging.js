import pino from 'pino'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'

/**
 * PII fields to redact from logs
 */
const PII_FIELDS = ['email', 'phone', 'ssn', 'password', 'token']

/**
 * Create a redaction configuration for Pino
 */
function createRedaction() {
  return {
    paths: PII_FIELDS,
    censor: '[REDACTED]',
  }
}

// ============================================================================
// AXIOM INTEGRATION (COMMENTED OUT FOR DEVELOPMENT - ENABLE FOR PRODUCTION)
// ============================================================================
// /**
//  * Axiom buffer for batching logs
//  */
// let axiomBuffer = []
// let axiomFlushTimer = null
//
// /**
//  * Flush logs to Axiom
//  */
// async function flushToAxiom() {
//   const axiomToken = process.env.AXIOM_TOKEN
//   const axiomDataset = process.env.AXIOM_DATASET
//
//   if (!axiomToken || !axiomDataset || axiomBuffer.length === 0) {
//     return
//   }
//
//   const logsToSend = [...axiomBuffer]
//   axiomBuffer = []
//
//   try {
//     const response = await fetch(`https://api.axiom.co/v1/datasets/${axiomDataset}/ingest`, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${axiomToken}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(logsToSend),
//     })
//
//     if (!response.ok) {
//       console.error('[Axiom] Failed to send logs:', response.status, await response.text())
//     }
//   } catch (error) {
//     console.error('[Axiom] Error sending logs:', error.message)
//   }
// }
//
// /**
//  * Create Axiom writable stream
//  */
// function createAxiomStream() {
//   const axiomToken = process.env.AXIOM_TOKEN
//   const axiomDataset = process.env.AXIOM_DATASET
//
//   if (!axiomToken || !axiomDataset) {
//     return null
//   }
//
//   return {
//     write(log) {
//       try {
//         const logEntry = typeof log === 'string' ? JSON.parse(log) : log
//
//         // Buffer the log
//         axiomBuffer.push(logEntry)
//
//         // Clear existing timer
//         if (axiomFlushTimer) {
//           clearTimeout(axiomFlushTimer)
//         }
//
//         // Flush after 1 second of inactivity or when buffer reaches 100 logs
//         if (axiomBuffer.length >= 100) {
//           flushToAxiom()
//         } else {
//           axiomFlushTimer = setTimeout(() => flushToAxiom(), 1000)
//         }
//       } catch (error) {
//         console.error('[Axiom] Error buffering log:', error.message)
//       }
//     },
//   }
// }
// ============================================================================

/**
 * Create file stream for logging
 */
async function createLogFileStream() {
  const logFilePath = 'logs/app.log'

  try {
    // Ensure logs directory exists
    await mkdir(dirname(logFilePath), { recursive: true })

    // Create write stream
    return createWriteStream(logFilePath, { flags: 'a' })
  } catch (error) {
    console.error('[Logging] Failed to create log file:', error.message)
    return null
  }
}

/**
 * @typedef {Object} LoggerContext
 * @property {string} [requestId] - Request ID
 * @property {string} [correlationId] - Correlation ID
 * @property {string} [tenantId] - Tenant ID
 */

/**
 * Get a logger instance with bound context
 * @param {Object} appContext - App-level context
 * @param {string} appContext.service - Service name
 * @param {string} appContext.version - Service version
 * @param {string} appContext.logLevel - Log level
 * @param {LoggerContext} [requestContext] - Request-level context
 * @returns {import('pino').Logger} Pino logger instance
 */
export async function getLogger(appContext, requestContext = {}) {
  // Create log file stream
  const fileStream = await createLogFileStream()

  // Create multistream for console and file
  const streams = [
    { stream: process.stdout }, // Console output
  ]

  if (fileStream) {
    streams.push({ stream: fileStream }) // File output
  }

  // PRODUCTION: Uncomment to enable Axiom
  // const axiomStream = createAxiomStream()
  // if (axiomStream) {
  //   streams.push({ stream: axiomStream })
  // }

  const baseLogger = pino({
    level: appContext.logLevel || 'info',
    redact: createRedaction(),
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
    base: {
      service: appContext.service,
      version: appContext.version,
    },
  }, pino.multistream(streams))

  const bindings = {}
  if (requestContext.requestId) bindings.request_id = requestContext.requestId
  if (requestContext.correlationId) bindings.correlation_id = requestContext.correlationId
  if (requestContext.tenantId) bindings.tenant_id = requestContext.tenantId

  return Object.keys(bindings).length > 0 ? baseLogger.child(bindings) : baseLogger
}
