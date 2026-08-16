import type { FC } from 'react'
import {
	BentoGrid,
	BentoGridFeatureLookupWrapper,
	BentoGridSeperator,
} from '@/components/bento-grid'
import BentoGridFeatureLookUpCard from '@/components/bento-grid/components/bento-grid-feature-lookup-card'
import LayoutWrapper from '@/components/layout-wrapper'
import SectionHeading from '@/components/sectionHeading'
import styles from './styles.module.css'

const featureLookup = [
	{
		id: 'git-1',
		title: 'Commit history',
		description: 'Every edit is a Git commit. Full diff and rollback support.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M1.5 2.75a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1-.75-.75zm0 5a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1-.75-.75zm0 5a.75.75 0 0 1 .75-.75H8a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1-.75-.75z' />
			</svg>
		),
	},
	{
		id: 'git-2',
		title: 'Branch support',
		description: 'Draft ideas in branches. Merge when ready.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25z' />
			</svg>
		),
	},
	{
		id: 'git-3',
		title: 'Signed commits',
		description: 'Attribution is cryptographically signed per device.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215z' />
			</svg>
		),
	},
	{
		id: 'git-4',
		title: 'BYO remote',
		description: 'GitHub, GitLab, or Forgejo. You own the repo.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z' />
			</svg>
		),
	},
]

const GitHistory: FC = () => {
	return (
		<section className={styles.long__term__planning}>
			<LayoutWrapper>
				<div className={styles.heading__container}>
					<div className={styles.heading__inner__container}>
						<SectionHeading
							heading='Git-backed history'
							badgeText='Version control'
							badgeStyle='bg-white/10 border-none'
						/>
					</div>
					<div className={styles.description__container}>
						<p>
							<span>Every edit is a commit.</span> Full audit trail, rollback, and
							attribution built into the storage layer — not bolted on top.
						</p>
					</div>
				</div>
			</LayoutWrapper>

			<div className={styles.hero__img__wrapper}>
				<div className={styles.git__log}>
					{[
						{ hash: 'a3f8c2e', msg: 'Update weekly review', time: '2m ago' },
						{ hash: 'b91d4f1', msg: 'Add research notes', time: '1h ago' },
						{ hash: 'c7a2e09', msg: 'Encrypt secrets vault', time: '3h ago' },
						{ hash: 'd45f8b3', msg: 'Initial vault setup', time: 'yesterday' },
					].map((commit) => (
						<div key={commit.hash} className={styles.git__commit}>
							<span className={styles.commit__hash}>{commit.hash}</span>
							<span className={styles.commit__msg}>{commit.msg}</span>
							<span className={styles.commit__time}>{commit.time}</span>
						</div>
					))}
				</div>
			</div>

			<LayoutWrapper>
				<BentoGrid>
					<BentoGridSeperator />

					<BentoGridFeatureLookupWrapper>
						{featureLookup.map((f) => (
							<BentoGridFeatureLookUpCard key={f.id} {...f} />
						))}
					</BentoGridFeatureLookupWrapper>
				</BentoGrid>
			</LayoutWrapper>
		</section>
	)
}

export default GitHistory
