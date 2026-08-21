import { Link } from 'lucide-react'
import type { FC } from 'react'
import {
	BentoGrid,
	BentoGridFeatureLookupWrapper,
	BentoGridSeperator,
	BentoGridTopLayer,
} from '@/components/bento-grid'
import BentoCardLeft from '@/components/bento-grid/components/bento-grid-card-left'
import BentoGridCardRight from '@/components/bento-grid/components/bento-grid-card-right'
import BentoGridFeatureLookUpCard from '@/components/bento-grid/components/bento-grid-feature-lookup-card'
import LayoutWrapper from '@/components/layout-wrapper'
import SectionHeading from '@/components/sectionHeading'
import styles from './styles.module.css'

const featureLookup = [
	{
		id: 'nf-1',
		title: 'Markdown editor',
		description: 'Full CommonMark support with slash commands and live preview.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M2 2h12v12H2V2zm1 1v10h10V3H3zm1 2h3v1H4V5zm0 2h8v1H4V7zm0 2h5v1H4V9z' />
			</svg>
		),
	},
	{
		id: 'nf-2',
		title: 'age encryption',
		description: 'Every note encrypted with X25519 before leaving your device.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M8 1a3 3 0 0 0-3 3v1H3v9h10V5h-2V4a3 3 0 0 0-3-3zm0 1a2 2 0 0 1 2 2v1H6V4a2 2 0 0 1 2-2zm0 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z' />
			</svg>
		),
	},
	{
		id: 'nf-3',
		title: 'Slash commands',
		description: 'Insert headings, code blocks, and embeds with / commands.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M9.5 2l-3 12h-1l3-12h1z' />
			</svg>
		),
	},
	{
		id: 'nf-4',
		title: 'Git sync',
		description: 'Every save commits to your chosen Git remote automatically.',
		icon: (
			<svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
				<path d='M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25z' />
			</svg>
		),
	},
]

const NoteEditorPreview: FC = () => (
	<div className={styles.hero__img__wrapper}>
		<div className={styles.editor__preview}>
			<div className={styles.editor__toolbar}>
				<span>B</span>
				<span>I</span>
				<span>H1</span>
				<span>H2</span>
				<span>{'</>'}</span>
				<span><Link size={14} /></span>
			</div>
			<div className={styles.editor__content}>
				<div className={styles.editor__h1}>My encrypted note</div>
				<div className={styles.editor__p}>
					This note is stored as an age-encrypted file in your Git repo.
					Only devices with your key can read it.
				</div>
				<div className={styles.editor__code}>
					{'# Weekly Review\n\nThis content is encrypted at rest.'}
				</div>
			</div>
		</div>
	</div>
)

const NoteEncryptionMockup: FC = () => (
	<div className={styles.encrypt__mockup}>
		<div className={styles.encrypt__before}>
			<div className={styles.encrypt__label}>plaintext</div>
			<div className={styles.encrypt__text}>Weekly Review</div>
			<div className={styles.encrypt__line} style={{ width: '80%' }} />
			<div className={styles.encrypt__line} style={{ width: '60%' }} />
		</div>
		<div className={styles.encrypt__arrow}>
			<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
				<rect x='3' y='11' width='18' height='11' rx='2' />
				<path d='M7 11V7a5 5 0 0 1 10 0v4' />
			</svg>
			<span>age</span>
		</div>
		<div className={styles.encrypt__after}>
			<div className={styles.encrypt__label}>ciphertext</div>
			<div className={styles.encrypt__cipher}>AGE1YT3...</div>
			<div className={styles.encrypt__cipher__line} style={{ width: '85%' }} />
			<div className={styles.encrypt__cipher__line} style={{ width: '70%' }} />
		</div>
	</div>
)

const NoteEditorMockup: FC = () => (
	<div className={styles.editor__mockup}>
		<div className={styles.mockup__toolbar}>
			<span className={styles.mockup__tool}>B</span>
			<span className={styles.mockup__tool}>I</span>
			<span className={styles.mockup__tool}>H1</span>
			<span className={styles.mockup__tool__sep} />
			<span className={styles.mockup__tool}>{'</>'}</span>
			<span className={styles.mockup__tool}>⌘K</span>
			<span className={styles.mockup__slash}>/</span>
		</div>
		<div className={styles.mockup__content}>
			<div className={styles.mockup__heading}>Weekly Review</div>
			<div className={styles.mockup__text} style={{ width: '82%' }} />
			<div className={styles.mockup__text} style={{ width: '65%' }} />
			<div className={styles.mockup__code__block}>
				<span className={styles.mockup__code__kw}>const</span>
				<span className={styles.mockup__code__var}> note</span>
				<span className={styles.mockup__code__op}> =</span>
				<span className={styles.mockup__code__str}> &ldquo;...&rdquo;</span>
			</div>
			<div className={styles.mockup__text} style={{ width: '70%' }} />
			<div className={styles.mockup__text} style={{ width: '45%' }} />
		</div>
	</div>
)

const NoteManagement: FC = () => {
	return (
		<section id='features' className={styles.issue__tracking}>
			<LayoutWrapper>
				<div className={styles.heading__container}>
					<div className={styles.heading__inner__container}>
						<SectionHeading
							heading='Notes you actually enjoy writing'
							badgeText='Note editor'
							badgeStyle='bg-white/10 border-none'
						/>

						<div>
							<p>
								<span>Optimized for focus and flow.</span> Write in Markdown,
								encrypt with one key, sync to Git. Your notes stay private,
								structured, and versioned.
							</p>
						</div>
					</div>
				</div>
			</LayoutWrapper>

			<NoteEditorPreview />

			<LayoutWrapper>
				<BentoGrid>
					<BentoGridTopLayer>
						<BentoCardLeft
							title='Write with focus'
							description='Clean Markdown editor with slash commands, code blocks, and math support.'>
							<NoteEditorMockup />
						</BentoCardLeft>
						<BentoGridCardRight
							title='Encrypted by default'
							description='Every note is age-encrypted before it syncs. The server never sees plaintext.'>
							<NoteEncryptionMockup />
						</BentoGridCardRight>
					</BentoGridTopLayer>

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

export default NoteManagement
