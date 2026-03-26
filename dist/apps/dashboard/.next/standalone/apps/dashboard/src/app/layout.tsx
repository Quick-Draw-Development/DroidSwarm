import type { Metadata } from 'next';

import './global.css';

export const metadata: Metadata = {
  title: 'DroidSwarm Dashboard',
  description: 'Kanban and channel interface for a project-scoped DroidSwarm instance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
