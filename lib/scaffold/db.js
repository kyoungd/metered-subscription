import { PrismaClient } from '@prisma/client'

/**
 * Global Prisma client instance to prevent multiple instances in development
 */
const globalForPrisma = global

/**
 * Create or reuse Prisma client
 * @returns {PrismaClient} Prisma client instance
 */
function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

  return client
}

/**
 * Database client (Prisma)
 * @type {PrismaClient}
 */
export const db = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

/**
 * Ping database to verify connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function ping() {
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    throw new Error(`Database ping failed: ${error.message}`)
  }
}

/**
 * Execute function within a database transaction
 * @param {Function} fn - Function to execute within transaction
 * @returns {Promise<any>} Result of fn
 */
export async function withTx(fn) {
  return db.$transaction(async (tx) => {
    return fn(tx)
  })
}

/**
 * Disconnect from database (useful for cleanup in tests)
 * @returns {Promise<void>}
 */
export async function disconnect() {
  await db.$disconnect()
}
