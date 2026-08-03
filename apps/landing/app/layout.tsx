import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
	title: 'NoteKit — Your private second brain',
	description:
		'E2E encrypted, Git-backed, agent-ready note-taking. Own your notes.',
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html lang='en'>
			<body>{children}</body>
		</html>
	)
}
