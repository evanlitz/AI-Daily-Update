import crypto from 'crypto'
import db from './db'

export async function startCronRun(path: string): Promise<string> {
  const id = crypto.randomUUID()
  try {
    await db.execute({
      sql: `INSERT INTO cron_runs (id, path, started_at, status) VALUES (?, ?, ?, 'running')`,
      args: [id, path, new Date().toISOString()],
    })
  } catch (err) {
    console.error('[cronRuns] failed to record start:', err)
  }
  return id
}

export async function finishCronRun(id: string, status: 'success' | 'failed', error?: string): Promise<void> {
  try {
    await db.execute({
      sql: `UPDATE cron_runs SET completed_at = ?, status = ?, error_text = ? WHERE id = ?`,
      args: [new Date().toISOString(), status, error ?? null, id],
    })
  } catch (err) {
    console.error('[cronRuns] failed to record finish:', err)
  }
}
