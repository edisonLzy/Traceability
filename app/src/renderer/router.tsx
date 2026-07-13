import { createMemoryRouter, Navigate } from 'react-router-dom'
import { Layout } from '@renderer/Layout'
import { AppsPage } from '@renderer/pages/apps'
import { AppDetailPage } from '@renderer/pages/apps/detail'
import { IssuesPage } from '@renderer/pages/issues'
import { IssueDetailPage } from '@renderer/pages/issues/detail'
import { PerformancePage } from '@renderer/pages/performance'
import { SettingsPage } from '@renderer/pages/settings'

export const router = createMemoryRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/issues" replace /> },
      { path: 'apps', element: <AppsPage /> },
      { path: 'apps/:id', element: <AppDetailPage /> },
      { path: 'issues', element: <IssuesPage /> },
      { path: 'issues/:id', element: <IssueDetailPage /> },
      { path: 'performance', element: <PerformancePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/issues" replace /> },
    ],
  },
])
