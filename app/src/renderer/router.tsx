import { Layout } from "@renderer/pages/_layout";
import { IssuesPage } from "@renderer/pages/issues";
import { IssueDetailPage } from "@renderer/pages/issues/detail";
import { PerformancePage } from "@renderer/pages/performance";
import { createMemoryRouter, Navigate } from "react-router-dom";

export const router = createMemoryRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/issues" replace /> },
      { path: "issues", element: <IssuesPage /> },
      { path: "issues/:id", element: <IssueDetailPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "*", element: <Navigate to="/issues" replace /> },
    ],
  },
]);
