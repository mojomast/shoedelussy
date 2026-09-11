import type { CodeVersion } from '@/types/project'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface VersionHistoryPanelProps {
  versions: CodeVersion[]
  isLoading: boolean
  isRestoring: boolean
  error: string | null
  onRefresh: () => void
  onRestore: (version: CodeVersion) => void
}

const VersionHistoryPanel = ({ versions, isLoading, isRestoring, error, onRefresh, onRestore }: VersionHistoryPanelProps) => {
  return (
    <Card className="flex min-h-0 flex-col border-zinc-900 bg-black/55 text-white shadow-none">
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Version history</p>
            <p className="text-xs text-zinc-500">
              {versions.length > 0
                ? `${versions.length} saved snapshot${versions.length === 1 ? '' : 's'}. Showing the most recent ${Math.min(versions.length, 10)}.`
                : 'Server-backed snapshots you can restore into the editor.'}
            </p>
          </div>
          <Button variant="outline" className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900" onClick={onRefresh}>
            Refresh
          </Button>
        </div>

        {error ? <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</p> : null}
        {isLoading ? <p className="text-sm text-zinc-500">Loading versions...</p> : null}

        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          {versions.length === 0 && !isLoading ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500">No saved snapshots yet.</p>
          ) : null}

          {versions.slice(0, 10).map((version) => (
            <div key={version.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{version.label || 'Unnamed snapshot'}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {version.created_by.toUpperCase()} · {new Date(version.created_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900"
                  onClick={() => onRestore(version)}
                  disabled={isRestoring}
                >
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default VersionHistoryPanel
