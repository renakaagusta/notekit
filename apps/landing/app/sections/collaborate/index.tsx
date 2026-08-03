import { type FC } from 'react'
import styles from './styles.module.css'
import SectionHeading from '@/components/sectionHeading'
import LayoutWrapper from '@/components/layout-wrapper'

const agentCards = [
	{
		id: 'ac-1',
		title: 'MCP protocol',
		description: 'Agents connect via Model Context Protocol — the open standard.',
	},
	{
		id: 'ac-2',
		title: 'Least-privilege keys',
		description: 'Each agent gets only the age key for notes shared to it.',
	},
	{
		id: 'ac-3',
		title: 'Signed writes',
		description: 'Agent commits are signed — attribution is always clear.',
	},
	{
		id: 'ac-4',
		title: 'Read-only by default',
		description:
			'Agents can only read notes explicitly shared. Never the master phrase.',
	},
	{
		id: 'ac-5',
		title: 'Claude Code ready',
		description: 'Works as a Claude Code MCP server out of the box.',
	},
	{
		id: 'ac-6',
		title: 'Audit trail',
		description: 'Every agent action is a commit in your Git history.',
	},
	{
		id: 'ac-7',
		title: 'Revoke anytime',
		description: 'Remove an agent key and re-encrypt. Forward-only revocation.',
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
