import type { FC } from 'react'
import LayoutWrapper from '@/components/layout-wrapper'
import SectionHeading from '@/components/sectionHeading'
import styles from './styles.module.css'

const agentCards = [
	{
		id: 'ac-1',
		title: 'MCP protocol',
		description: 'Agents connect via Model Context Protocol — the open standard.',
		icon: (
			<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<circle cx='12' cy='12' r='3' />
				<path d='M12 3v2M12 19v2M3 12h2M19 12h2M5.636 5.636l1.414 1.414M16.95 16.95l1.414 1.414M5.636 18.364l1.414-1.414M16.95 7.05l1.414-1.414' />
			</svg>
		),
	},
	{
		id: 'ac-2',
		title: 'Least-privilege keys',
		description: 'Each agent gets only the age key for notes shared to it.',
		icon: (
			<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<path d='m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4' />
			</svg>
		),
	},
	{
		id: 'ac-3',
		title: 'Signed writes',
		description: 'Agent commits are signed — attribution is always clear.',
		icon: (
			<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
				<path d='m9 12 2 2 4-4' />
			</svg>
		),
	},
	{
		id: 'ac-4',
		title: 'Read-only by default',
		description: 'Agents can only read notes explicitly shared. Never the master phrase.',
		icon: (
			<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<rect x='3' y='11' width='18' height='11' rx='2' />
				<path d='M7 11V7a5 5 0 0 1 10 0v4' />
			</svg>
		),
	},
	{
		id: 'ac-5',
		title: 'Claude Code ready',
		description: 'Works as a Claude Code MCP server out of the box.',
		icon: (
			<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<polyline points='16 18 22 12 16 6' />
				<polyline points='8 6 2 12 8 18' />
			</svg>
		),
	},
	{
		id: 'ac-6',
		title: 'Audit trail',
		description: 'Every agent action is a commit in your Git history.',
		icon: (
			<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<path d='M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22' />
			</svg>
		),
	},
	{
		id: 'ac-7',
		title: 'Revoke anytime',
		description: 'Remove an agent key and re-encrypt. Forward-only revocation.',
		icon: (
			<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<path d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' />
				<path d='M3 3v5h5' />
				<path d='m15 9-6 6M9 9l6 6' />
			</svg>
		),
	},
]

const AgentAccess: FC = () => {
	return (
		<section className={styles.collaborate}>
			<LayoutWrapper>
				<div className={styles.heading__container}>
					<div className={styles.heading__inner__container}>
						<SectionHeading
							heading='Agent access, zero trust'
							badgeText='MCP & integrations'
							badgeStyle='bg-white/10 border-none'
						/>
					</div>

					<div className={styles.heading__text__container}>
						<p>
							Give your AI agents access to your notes without giving them your
							keys. NoteKit&apos;s least-privilege model means agents can only
							read what you explicitly share — and every write is signed.
						</p>
					</div>
				</div>
			</LayoutWrapper>

			<div className={styles.carousel__container}>
				<div className={styles.carousel__inner}>
					{agentCards.map((card) => (
						<div key={card.id} className={styles.agent__card}>
							<div className={styles.card__icon}>{card.icon}</div>
							<div className={styles.card__content}>
								<h3 className={styles.card__title}>{card.title}</h3>
								<p className={styles.card__desc}>{card.description}</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}

export default AgentAccess
