import { Command } from 'commander'
import { api } from '../lib/api.js'
import { printJson, printTable } from '../lib/output.js'
import type { Application } from '@traceability/protocol'

export function appCommand(program: Command): void {
  const cmd = program.command('app').description('manage applications')
  cmd
    .command('list')
    .option('--json', 'output JSON')
    .action(async (opts) => {
      const apps = await api.get<Application[]>('/api/apps')
      opts.json ? printJson(apps) : printTable(apps, [
        { key: 'id', label: 'ID', width: 36 },
        { key: 'name', label: 'NAME', width: 20 },
        { key: 'defaultBranch', label: 'BRANCH', width: 12 },
      ])
    })

  cmd
    .command('create')
    .requiredOption('--name <name>')
    .requiredOption('--repo-url <url>')
    .requiredOption('--branch <branch>')
    .option('--json', 'output JSON')
    .action(async (opts) => {
      const app = await api.post<Application>('/api/apps', {
        name: opts.name, repoUrl: opts.repoUrl, defaultBranch: opts.branch,
      })
      opts.json ? printJson(app) : console.log(`Created app ${app.id} (${app.name})`)
    })

  cmd
    .command('show <appId>')
    .option('--json', 'output JSON')
    .action(async (appId, opts) => {
      const app = await api.get<Application>(`/api/apps/${appId}`)
      opts.json ? printJson(app) : printJson(app)
    })

  cmd
    .command('update <appId>')
    .option('--name <name>')
    .option('--repo-url <url>')
    .option('--branch <branch>')
    .action(async (appId, opts) => {
      const body: Record<string, string> = {}
      if (opts.name) body.name = opts.name
      if (opts.repoUrl) body.repoUrl = opts.repoUrl
      if (opts.branch) body.defaultBranch = opts.branch
      const app = await api.patch<Application>(`/api/apps/${appId}`, body)
      printJson(app)
    })

  cmd
    .command('delete <appId>')
    .action(async (appId) => {
      await api.delete(`/api/apps/${appId}`)
      console.log('Deleted.')
    })
}
