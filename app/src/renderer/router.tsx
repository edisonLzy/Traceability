import { createMemoryRouter, Navigate, redirect, type LoaderFunctionArgs } from 'react-router-dom'
import { Layout } from '@renderer/Layout'
import { LoginPage } from '@renderer/pages/login'
import { AppsPage } from '@renderer/pages/apps'
import { AppDetailPage } from '@renderer/pages/apps/detail'
import { IssuesPage } from '@renderer/pages/issues'
import { IssueDetailPage } from '@renderer/pages/issues/detail'
import { PerformancePage } from '@renderer/pages/performance'
import { SettingsPage } from '@renderer/pages/settings'
import { getToken } from '@renderer/store/auth'

/** Auth guard: bounce unauthenticated users to /login. */
function requireAuth(_: LoaderFunctionArgs) {
  if (!getToken()) throw redirect('/login')
  return null
}

/** Keep authenticated users out of the login page. */
function redirectIfAuthed(_: LoaderFunctionArgs) {
  if (getToken()) throw redirect('/issues')
  return null
}

export const router = createMemoryRouter([
  {
    path: '/login',
    loader: redirectIfAuthed,
    element: <LoginPage />,
  },
  {
    element: <Layout />,
    loader: requireAuth,
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
