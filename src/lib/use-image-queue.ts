import { useCallback, useState } from 'react'
import type { Run } from './experiments'

export type QueueItem = { id: string; name: string; image: string; status: 'pending' | 'running' | 'done' | 'error'; run?: Run; error?: string }
export type ImageQueueState = { items: QueueItem[]; selectedId: string; revision: number }

export function useImageQueue() {
  const [queues, setQueues] = useState<Record<string, ImageQueueState>>({})
  const append = useCallback((experiment: string, items: QueueItem[]) => {
    setQueues(previous => {
      const existing = previous[experiment]
      return { ...previous, [experiment]: { items: [...(existing?.items ?? []), ...items], selectedId: items[0].id, revision: existing?.revision ?? 0 } }
    })
  }, [])
  const select = useCallback((experiment: string, id: string) => {
    setQueues(previous => ({ ...previous, [experiment]: { ...previous[experiment], selectedId: id } }))
  }, [])
  const update = useCallback((experiment: string, id: string, revision: number, changes: Partial<QueueItem>) => {
    setQueues(previous => {
      const queue = previous[experiment]
      if (!queue || queue.revision !== revision) return previous
      return { ...previous, [experiment]: { ...queue, items: queue.items.map(item => item.id === id ? { ...item, ...changes } : item) } }
    })
  }, [])
  const invalidate = useCallback((experiment: string) => {
    setQueues(previous => {
      const queue = previous[experiment]
      if (!queue) return previous
      return { ...previous, [experiment]: { ...queue, revision: queue.revision + 1, items: queue.items.map(({ run: _run, error: _error, ...item }) => ({ ...item, status: 'pending' })) } }
    })
  }, [])
  const clear = useCallback((experiment: string) => {
    setQueues(previous => { const next = { ...previous }; delete next[experiment]; return next })
  }, [])
  return { queues, append, select, update, invalidate, clear }
}
