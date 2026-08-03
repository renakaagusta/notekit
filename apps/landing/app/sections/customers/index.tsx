import { type FC } from 'react'
import styles from './styles.module.css'
import LayoutWrapper from '@/components/layout-wrapper'

const LockIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<rect x='3' y='11' width='18' height='11' rx='2' />
		<path d='M7 11V7a5 5 0 0 1 10 0v4' />
	</svg>
)

const GitIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='currentColor'>
		<path d='M23.546 10.93L13.067.452a1.55 1.55 0 0 0-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 0 1 2.327 2.341l2.658 2.66a1.838 1.838 0 0 1 1.9 3.039 1.837 1.837 0 0 1-2.606-2.581L13.48 8.2v6.261a1.838 1.838 0 0 1 .48 3.634 1.837 1.837 0 0 1-2.302-1.486H11.6a1.838 1.838 0 0 1-1.836-1.836V8.2L7.098 5.534a1.836 1.836 0 0 1-2.404 2.357L2.168 5.255.451 6.97a1.55 1.55 0 0 0 0 2.19l10.48 10.478a1.55 1.55 0 0 0 2.189 0l10.426-10.43a1.55 1.55 0 0 0 0-2.188' />
	</svg>
)

const MarkdownIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='currentColor'>
		<path d='M22.27 19.385H1.73C.775 19.385 0 18.61 0 17.655V6.345c0-.955.775-1.73 1.73-1.73h20.54c.955 0 1.73.775 1.73 1.73v11.31c0 .955-.775 1.73-1.73 1.73zM5.769 15.923v-4.5l2.308 2.885 2.307-2.885v4.5h2.308V8.077h-2.308l-2.307 2.885-2.308-2.885H3.46v7.846zm13.076.008l-3.461-3.923H17v-3.93h2.307v3.93h1.615z'/>
	</svg>
)

const McpIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
		<circle cx='12' cy='12' r='3' />
		<path d='M12 3v2M12 19v2M3 12h2M19 12h2M5.636 5.636l1.414 1.414M16.95 16.95l1.414 1.414M5.636 18.364l1.414-1.414M16.95 7.05l1.414-1.414' />
	</svg>
)

const KeyIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<path d='m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4' />
	</svg>
)

const ForgejoIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<circle cx='12' cy='5' r='2' />
		<circle cx='5' cy='19' r='2' />
		<circle cx='19' cy='19' r='2' />
		<path d='M12 7v4M5 17V13a7 7 0 0 1 7-7M19 17V13a7 7 0 0 0-7-7' />
	</svg>
)

const ShieldIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
	</svg>
)

const EditIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' />
	</svg>
)

const DbIcon = () => (
	<svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<ellipse cx='12' cy='5' rx='9' ry='3' />
		<path d='M21 12c0 1.657-4.03 3-9 3S3 13.657 3 12' />
		<path d='M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5' />
	</svg>
)

const techItems = [
	{ name: 'age', icon: <LockIcon /> },
	{ name: 'Git', icon: <GitIcon /> },
	{ name: 'Markdown', icon: <MarkdownIcon /> },
	{ name: 'MCP', icon: <McpIcon /> },
	{ name: 'BIP39', icon: <KeyIcon /> },
	{ name: 'Forgejo', icon: <ForgejoIcon /> },
	{ name: 'X25519', icon: <ShieldIcon /> },
	{ name: 'ProseMirror', icon: <EditIcon /> },
	{ name: 'IndexedDB', icon: <DbIcon /> },
]

const TechStack: FC = () => {
	return (
		<section className={styles.customers}>
			<LayoutWrapper>
				<p className={styles.description__large__screen}>
					<span className={styles.highlight}>Built on open tech.</span>
					<br />
					Open standards and open-source tools, all the way down.
				</p>

				<p className={styles.description__small__screen}>
					Built on open tech. No proprietary lock-in.
				</p>

				<div className={styles.tech__grid}>
					{techItems.map((item) => (
						<div key={item.name} className={styles.tech__item}>
							<span className={styles.tech__abbr}>{item.icon}</span>
							<span className={styles.tech__name}>{item.name}</span>
						</div>
					))}
				</div>
			</LayoutWrapper>
		</section>
	)
}

export default TechStack
